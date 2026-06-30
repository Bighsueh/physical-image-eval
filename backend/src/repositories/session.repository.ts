import type { Account, Session } from '@prisma/client';
import { prisma, type Db } from '../lib/prisma';

/** Prisma data access for Session (research D1/D2). Lookup is by tokenHash on every request. */

export interface CreateSessionInput {
  tokenHash: string;
  accountId: string;
  csrfToken: string;
  expiresAt: Date;
}

export type SessionWithAccount = Session & { account: Account };

export const sessionRepository = {
  create(input: CreateSessionInput, db: Db = prisma): Promise<Session> {
    return db.session.create({ data: input });
  },

  /** Resolve a session by token hash, with its account (require-auth needs role/isActive). */
  findByTokenHash(tokenHash: string, db: Db = prisma): Promise<SessionWithAccount | null> {
    return db.session.findUnique({ where: { tokenHash }, include: { account: true } });
  },

  /** Logout / single-session revoke (FR-018). No-op if already revoked. */
  async revoke(id: string, when: Date, db: Db = prisma): Promise<void> {
    await db.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: when },
    });
  },

  /** Revoke ALL active sessions of an account (disable/reset, multi-device — FR-017). */
  async revokeAllForAccount(
    accountId: string,
    when: Date,
    db: Db = prisma,
    exceptSessionId?: string,
  ): Promise<number> {
    const result = await db.session.updateMany({
      where: {
        accountId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: when },
    });
    return result.count;
  },

  /** Sliding idle marker refresh (throttled by the service to ≤ 1/min, D2). */
  async touchLastSeen(id: string, when: Date, db: Db = prisma): Promise<void> {
    await db.session.update({ where: { id }, data: { lastSeenAt: when } });
  },
};
