import type { Account } from '@prisma/client';
import { AppError } from '../lib/errors';
import { accountRepository } from '../repositories/account.repository';
import { dummyVerify, verifyPassword } from './password.service';
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
