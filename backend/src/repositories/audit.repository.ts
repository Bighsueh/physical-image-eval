import type { AuditAction, AuditLog, Prisma } from '@prisma/client';
import { prisma, type Db } from '../lib/prisma';

/**
 * Append-only data access for AuditLog (FR-023, D9). Written inside the SAME transaction as the
 * account mutation it records — so pass the transaction `db`. No update/delete methods exist by
 * design (immutability, constitution VI).
 */

export interface AppendAuditInput {
  actorAccountId: string | null;
  targetAccountId: string;
  action: AuditAction;
  meta?: Prisma.InputJsonValue;
}

export const auditRepository = {
  append(input: AppendAuditInput, db: Db = prisma): Promise<AuditLog> {
    return db.auditLog.create({
      data: {
        actorAccountId: input.actorAccountId,
        targetAccountId: input.targetAccountId,
        action: input.action,
        ...(input.meta !== undefined ? { meta: input.meta } : {}),
      },
    });
  },

  listForTarget(targetAccountId: string, db: Db = prisma): Promise<AuditLog[]> {
    return db.auditLog.findMany({
      where: { targetAccountId },
      orderBy: { createdAt: 'desc' },
    });
  },
};
