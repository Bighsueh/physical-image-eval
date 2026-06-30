import type { Account, Role } from '@prisma/client';
import { accountRepository } from '../../src/repositories/account.repository';
import { hashPassword } from '../../src/services/password.service';

/** Shared test factories — create accounts directly via the repository (no HTTP). */

export interface MakeAccountOverrides {
  username?: string;
  displayName?: string;
  role?: Role;
  password?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
  createdByAccountId?: string | null;
}

let counter = 0;

export const makeAccount = async (
  overrides: MakeAccountOverrides = {},
): Promise<{ account: Account; password: string }> => {
  const password = overrides.password ?? 'Test-Password-123';
  counter += 1;
  const account = await accountRepository.create({
    username: overrides.username ?? `user${counter}`,
    displayName: overrides.displayName ?? '測試者',
    role: overrides.role ?? 'REVIEWER',
    passwordHash: await hashPassword(password),
    mustChangePassword: overrides.mustChangePassword ?? false,
    createdByAccountId: overrides.createdByAccountId ?? null,
  });
  if (overrides.isActive === false) {
    const disabled = await accountRepository.setActive(account.id, false);
    return { account: disabled, password };
  }
  return { account, password };
};

export const makeAdmin = (overrides: MakeAccountOverrides = {}) =>
  makeAccount({ role: 'ADMIN', displayName: '管理員', ...overrides });

export const makeReviewer = (overrides: MakeAccountOverrides = {}) =>
  makeAccount({ role: 'REVIEWER', displayName: '審查者', ...overrides });
