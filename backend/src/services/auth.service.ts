import type { Account } from '@prisma/client';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { accountRepository } from '../repositories/account.repository';
import { sessionRepository } from '../repositories/session.repository';
import { dummyVerify, hashPassword, verifyPassword } from './password.service';
import { issueSession, type IssuedSession } from './session.service';

/**
 * Authentication service (FR-002, FR-004, D6). Every failure path — unknown username, wrong
 * password, disabled account — collapses into the SAME generic AUTH_FAILED, and an argon2 verify
 * always runs (real or dummy) so timing cannot reveal account existence (SC-004).
 */
export interface LoginResult {
  account: Account;
  issued: IssuedSession;
}

export const login = async (rawUsername: string, password: string): Promise<LoginResult> => {
  const username = rawUsername.trim().toLowerCase();
  const account = await accountRepository.findByUsername(username);

  if (!account) {
    await dummyVerify(password); // equalize timing on the unknown-user path
    throw new AppError('AUTH_FAILED');
  }

  const passwordOk = await verifyPassword(account.passwordHash, password);
  if (!passwordOk) throw new AppError('AUTH_FAILED');

  // Disabled check AFTER a real verify so the timing matches the success path (D6).
  if (!account.isActive) throw new AppError('AUTH_FAILED');

  const issued = await issueSession(account.id);
  return { account, issued };
};

/**
 * Change the caller's own password (forced after create/reset, or voluntary). Verifies the current
 * password, sets the new hash, clears mustChangePassword, and revokes the caller's OTHER sessions
 * while keeping the current one (FR-009). Password strength is enforced at the boundary (zod).
 */
export const changePassword = async (
  accountId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  const account = await accountRepository.findById(accountId);
  if (!account) throw new AppError('AUTH_REQUIRED');

  const currentOk = await verifyPassword(account.passwordHash, currentPassword);
  if (!currentOk) throw new AppError('AUTH_FAILED');

  // Reject reusing the current password — otherwise a forced change after reset could keep the
  // admin-known temp password as the live credential (SEC-L2; strengthens FR-009).
  const sameAsCurrent = await verifyPassword(account.passwordHash, newPassword);
  if (sameAsCurrent) throw new AppError('VALIDATION_ERROR', '新密碼不可與目前密碼相同');

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await accountRepository.setPassword(accountId, { passwordHash, mustChangePassword: false }, tx);
    await sessionRepository.revokeAllForAccount(accountId, new Date(), tx, currentSessionId);
  });
};
