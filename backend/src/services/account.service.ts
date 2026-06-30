import { type Account, Prisma, type Role } from '@prisma/client';
import { AppError } from '../lib/errors';
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
}

export interface CredentialResult {
  account: Account;
  tempPassword: string;
}

export const createAccount = async (params: CreateAccountParams): Promise<CredentialResult> => {
  // Defensive normalization (D11) — the boundary also normalizes, but never trust the caller.
  const username = params.username.trim().toLowerCase();
  const existing = await accountRepository.findByUsername(username);
  if (existing) throw new AppError('USERNAME_TAKEN');

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  try {
    const account = await prisma.$transaction(async (tx) => {
      const created = await accountRepository.create(
        {
          username,
          displayName: params.displayName,
          role: params.role,
          passwordHash,
          mustChangePassword: true,
          createdByAccountId: params.actorId,
        },
        tx,
      );
      await recordAction(
        {
          actorAccountId: params.actorId,
          targetAccountId: created.id,
          action: 'CREATE_ACCOUNT',
          meta: { role: params.role },
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

  // Governance continuity FIRST: never let an operation zero-out active admins (D10). This also
  // catches self-disable of the sole admin, surfacing the more informative LAST_ADMIN message.
  if (target.role === 'ADMIN') {
    const otherActiveAdmins = await accountRepository.countActiveAdmins(prisma, targetId);
    if (otherActiveAdmins === 0) throw new AppError('LAST_ADMIN_PROTECTED');
  }

  // Otherwise an admin still may not disable their own account (anti self-lockout) (D10).
  if (actorId === targetId) throw new AppError('SELF_OPERATION_FORBIDDEN');

  return prisma.$transaction(async (tx) => {
    const updated = await accountRepository.setActive(targetId, false, tx);
    await sessionRepository.revokeAllForAccount(targetId, new Date(), tx); // FR-017
    await recordAction(
      { actorAccountId: actorId, targetAccountId: targetId, action: 'DISABLE_ACCOUNT' },
      tx,
    );
    return updated;
  });
};

export const enableAccount = async (actorId: string, targetId: string): Promise<Account> => {
  const target = await accountRepository.findById(targetId);
  if (!target) throw new AppError('ACCOUNT_NOT_FOUND');

  // Already active → idempotent no-op (FR-010). Enable never issues a new credential.
  if (target.isActive) return target;

  return prisma.$transaction(async (tx) => {
    const updated = await accountRepository.setActive(targetId, true, tx);
    await recordAction(
      { actorAccountId: actorId, targetAccountId: targetId, action: 'ENABLE_ACCOUNT' },
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
      { actorAccountId: actorId, targetAccountId: targetId, action: 'RESET_CREDENTIAL' },
      tx,
    );
    return updated;
  });
  return { account, tempPassword };
};
