import type { Account, Prisma, Role } from '@prisma/client';
import { prisma, type Db } from '../lib/prisma';

/**
 * Prisma data access for Account (constitution XI — mutable domain). All methods accept an
 * optional `db` so callers can run them inside a transaction (audit + session revoke atomicity,
 * D9). Returns full rows incl. passwordHash — callers MUST strip it before responding.
 */

export interface AccountListFilters {
  role?: Role;
  isActive?: boolean;
  q?: string;
}

export interface CreateAccountInput {
  username: string; // already normalized at the boundary (D11)
  displayName: string;
  role: Role;
  passwordHash: string;
  mustChangePassword: boolean;
  createdByAccountId: string | null;
}

export const accountRepository = {
  findByUsername(username: string, db: Db = prisma): Promise<Account | null> {
    return db.account.findUnique({ where: { username } });
  },

  findById(id: string, db: Db = prisma): Promise<Account | null> {
    return db.account.findUnique({ where: { id } });
  },

  create(input: CreateAccountInput, db: Db = prisma): Promise<Account> {
    return db.account.create({ data: input });
  },

  list(filters: AccountListFilters = {}, db: Db = prisma): Promise<Account[]> {
    const where: Prisma.AccountWhereInput = {};
    if (filters.role) where.role = filters.role;
    if (typeof filters.isActive === 'boolean') where.isActive = filters.isActive;
    if (filters.q && filters.q.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { username: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
      ];
    }
    return db.account.findMany({ where, orderBy: { createdAt: 'desc' } });
  },

  setActive(id: string, isActive: boolean, db: Db = prisma): Promise<Account> {
    return db.account.update({ where: { id }, data: { isActive } });
  },

  setPassword(
    id: string,
    fields: { passwordHash: string; mustChangePassword: boolean },
    db: Db = prisma,
  ): Promise<Account> {
    return db.account.update({
      where: { id },
      data: {
        passwordHash: fields.passwordHash,
        mustChangePassword: fields.mustChangePassword,
        passwordUpdatedAt: new Date(),
      },
    });
  },

  /** Count active ADMIN accounts (governance continuity — last-active-admin guard, D10). */
  countActiveAdmins(db: Db = prisma, excludeId?: string): Promise<number> {
    return db.account.count({
      where: { role: 'ADMIN', isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
  },
};
