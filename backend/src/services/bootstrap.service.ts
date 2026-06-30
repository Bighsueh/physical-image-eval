import type { Account } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { accountRepository } from '../repositories/account.repository';
import { hashPassword } from './password.service';

/**
 * First-admin bootstrap (FR-020, D5). Idempotent: creates ONE ADMIN only when no ADMIN exists at
 * all; otherwise a no-op. The created admin must change the env-seeded password on first login.
 * Invoked by the deploy-time seed script — there is no HTTP path (constitution III).
 */
export interface BootstrapResult {
  created: boolean;
  account: Account | null;
}

export const bootstrapAdmin = async (
  username: string,
  password: string,
): Promise<BootstrapResult> => {
  const adminCount = await prisma.account.count({ where: { role: 'ADMIN' } });
  if (adminCount > 0) return { created: false, account: null };

  const account = await accountRepository.create({
    username: username.trim().toLowerCase(),
    displayName: '系統管理員',
    role: 'ADMIN',
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
    createdByAccountId: null,
  });
  return { created: true, account };
};
