import { type Account, Prisma, type Role } from '@prisma/client';
import { AppError, isAppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { generateTempPassword } from '../lib/tokens';
import {
  accountRepository,
  type AccountListFilters,
} from '../repositories/account.repository';
import { sessionRepository } from '../repositories/session.repository';
import { recordAction } from './audit.service';
import { hashPassword } from './password.service';

/**
 * Admin account lifecycle (US2). Every mutation that changes an account writes its audit row — and,
 * where required, revokes the target's sessions — inside ONE transaction (D9, FR-017). Invariants
 * (self-operation, last-active-admin, idempotency, reset-keeps-disabled) live here (D10).
 */

export interface CreateAccountParams {
  actorId: string;
  username: string; // normalized at the boundary (D11)
  displayName: string;
  role: Role;
  /** When set, the admin chooses the password directly (no forced first-login change). */
  password?: string;
}

export interface CredentialResult {
  account: Account;
  /** The one-time temp password; `null` when the admin set the password directly. */
  tempPassword: string | null;
}

export const createAccount = async (params: CreateAccountParams): Promise<CredentialResult> => {
  // Defensive normalization (D11) — the boundary also normalizes, but never trust the caller.
  const username = params.username.trim().toLowerCase();
  const existing = await accountRepository.findByUsername(username);
  if (existing) throw new AppError('USERNAME_TAKEN');

  // Admin-set password → no forced change; otherwise a random 6-digit temp + forced change.
  const adminSet = typeof params.password === 'string';
  const tempPassword = adminSet ? null : generateTempPassword();
  const passwordHash = await hashPassword(adminSet ? params.password! : tempPassword!);

  try {
    const account = await prisma.$transaction(async (tx) => {
      const created = await accountRepository.create(
        {
          username,
          displayName: params.displayName,
          role: params.role,
          passwordHash,
          mustChangePassword: !adminSet,
          createdByAccountId: params.actorId,
        },
        tx,
      );
      await recordAction(
        {
          actorAccountId: params.actorId,
          targetAccountId: created.id,
          action: 'CREATE_ACCOUNT',
          // Denormalize identity so the audit row stays meaningful if the account is later deleted.
          meta: { role: params.role, username, displayName: params.displayName, setByAdmin: adminSet },
        },
        tx,
      );
      return created;
    });
    return { account, tempPassword };
  } catch (err) {
    // Unique-constraint race → same friendly conflict (FR-019).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('USERNAME_TAKEN');
    }
    throw err;
  }
};

/** Per-item result for a batch operation (partial success — one bad row never fails the rest). */
export interface BatchCreateResult {
  username: string;
  success: boolean;
  account?: Account;
  tempPassword?: string | null;
  error?: string;
}

export const createAccountsBatch = async (
  actorId: string,
  items: Omit<CreateAccountParams, 'actorId'>[],
): Promise<BatchCreateResult[]> => {
  const results: BatchCreateResult[] = [];
  for (const item of items) {
    try {
      const { account, tempPassword } = await createAccount({ actorId, ...item });
      results.push({ username: account.username, success: true, account, tempPassword });
    } catch (err) {
      results.push({
        username: item.username,
        success: false,
        error: isAppError(err) ? err.publicMessage : '建立失敗',
      });
    }
  }
  return results;
};

/**
 * HARD delete an account (admin). Allowed ONLY when the account has no SUBMITTED reviews (those are
 * clinical data — disable instead). Cannot delete self or the last active admin. One Serializable
 * transaction: record DELETE_ACCOUNT audit (target FK SetNull-ed by the delete, identity kept in
 * meta), drop the account's drafts + sessions, then delete the account (audit rows preserved).
 */
export const deleteAccount = async (actorId: string, targetId: string): Promise<void> => {
  if (actorId === targetId) throw new AppError('SELF_OPERATION_FORBIDDEN');

  await prisma.$transaction(
    async (tx) => {
      // Read the target INSIDE the transaction so the role used for the last-admin guard cannot be
      // a stale snapshot (TOCTOU-safe even if a future role-change path is added).
      const target = await accountRepository.findById(targetId, tx);
      if (!target) throw new AppError('ACCOUNT_NOT_FOUND');

      if (target.role === 'ADMIN') {
        const otherActiveAdmins = await accountRepository.countActiveAdmins(tx, targetId);
        if (otherActiveAdmins === 0) throw new AppError('LAST_ADMIN_PROTECTED');
      }
      const submitted = await tx.review.count({
        where: { reviewerId: targetId, status: 'SUBMITTED' },
      });
      if (submitted > 0) throw new AppError('ACCOUNT_HAS_SUBMITTED_REVIEWS');

      await recordAction(
        {
          actorAccountId: actorId,
          targetAccountId: targetId,
          action: 'DELETE_ACCOUNT',
          meta: {
            username: target.username,
            displayName: target.displayName,
            role: target.role,
            deletedAccountId: targetId,
          },
        },
        tx,
      );
      // Only drafts exist (submitted blocked above); panels cascade. The account.delete then frees
      // the Review FK; a stray SUBMITTED row would make it fail (RESTRICT) → safe rollback.
      await tx.review.deleteMany({ where: { reviewerId: targetId, status: 'DRAFT' } });
      await tx.session.deleteMany({ where: { accountId: targetId } });
      await tx.account.delete({ where: { id: targetId } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
};

export interface BatchDeleteResult {
  accountId: string;
  success: boolean;
  error?: string;
}

export const deleteAccountsBatch = async (
  actorId: string,
  accountIds: string[],
): Promise<BatchDeleteResult[]> => {
  const results: BatchDeleteResult[] = [];
  for (const accountId of accountIds) {
    try {
      await deleteAccount(actorId, accountId);
      results.push({ accountId, success: true });
    } catch (err) {
      results.push({
        accountId,
        success: false,
        error: isAppError(err) ? err.publicMessage : '刪除失敗',
      });
    }
  }
  return results;
};

export const listAccounts = (filters: AccountListFilters = {}): Promise<Account[]> =>
  accountRepository.list(filters);

export const getAccount = async (id: string): Promise<Account> => {
  const account = await accountRepository.findById(id);
  if (!account) throw new AppError('ACCOUNT_NOT_FOUND');
  return account;
};

export const disableAccount = async (actorId: string, targetId: string): Promise<Account> => {
  const target = await accountRepository.findById(targetId);
  if (!target) throw new AppError('ACCOUNT_NOT_FOUND');

  // Already disabled → idempotent no-op (no audit, no state change) (FR-010).
  if (!target.isActive) return target;

  // All guards + the mutation run inside ONE Serializable transaction so the last-active-admin
  // invariant cannot be defeated by two concurrent disables (TOCTOU, D10).
  return prisma.$transaction(
    async (tx) => {
      // Governance continuity FIRST: never zero-out active admins (D10). This also catches
      // self-disable of the sole admin, surfacing the more informative LAST_ADMIN message.
      if (target.role === 'ADMIN') {
        const otherActiveAdmins = await accountRepository.countActiveAdmins(tx, targetId);
        if (otherActiveAdmins === 0) throw new AppError('LAST_ADMIN_PROTECTED');
      }
      // Otherwise an admin still may not disable their own account (anti self-lockout) (D10).
      if (actorId === targetId) throw new AppError('SELF_OPERATION_FORBIDDEN');

      const updated = await accountRepository.setActive(targetId, false, tx);
      await sessionRepository.revokeAllForAccount(targetId, new Date(), tx); // FR-017
      await recordAction(
        {
          actorAccountId: actorId,
          targetAccountId: targetId,
          action: 'DISABLE_ACCOUNT',
          // Denormalize identity so the row stays meaningful if the account is later deleted (SetNull).
          meta: { username: target.username, displayName: target.displayName },
        },
        tx,
      );
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
};

export const enableAccount = async (actorId: string, targetId: string): Promise<Account> => {
  const target = await accountRepository.findById(targetId);
  if (!target) throw new AppError('ACCOUNT_NOT_FOUND');

  // Already active → idempotent no-op (FR-010). Enable never issues a new credential.
  if (target.isActive) return target;

  return prisma.$transaction(async (tx) => {
    const updated = await accountRepository.setActive(targetId, true, tx);
    await recordAction(
      {
        actorAccountId: actorId,
        targetAccountId: targetId,
        action: 'ENABLE_ACCOUNT',
        meta: { username: target.username, displayName: target.displayName },
      },
      tx,
    );
    return updated;
  });
};

export const resetCredential = async (
  actorId: string,
  targetId: string,
): Promise<CredentialResult> => {
  if (actorId === targetId) throw new AppError('SELF_OPERATION_FORBIDDEN');

  const target = await accountRepository.findById(targetId);
  if (!target) throw new AppError('ACCOUNT_NOT_FOUND');

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const account = await prisma.$transaction(async (tx) => {
    // Keeps isActive unchanged — resetting a disabled account stays disabled (D10).
    const updated = await accountRepository.setPassword(
      targetId,
      { passwordHash, mustChangePassword: true },
      tx,
    );
    await sessionRepository.revokeAllForAccount(targetId, new Date(), tx); // FR-017
    await recordAction(
      {
        actorAccountId: actorId,
        targetAccountId: targetId,
        action: 'RESET_CREDENTIAL',
        meta: { username: target.username, displayName: target.displayName },
      },
      tx,
    );
    return updated;
  });
  return { account, tempPassword };
};
