import type { AuditAction, AuditLog, Prisma } from '@prisma/client';
import type { Db } from '../lib/prisma';
import { auditRepository } from '../repositories/audit.repository';

/**
 * Append-only governance audit (FR-023, D9). Callers pass the surrounding transaction `db` so the
 * audit row commits atomically with the account mutation it records. Guards against ever writing
 * sensitive context (passwords/temp passwords/hashes/tokens) into `meta` (constitution V).
 */

const SENSITIVE_KEY = /pass|secret|token|hash|credential|pwd/i;

export interface RecordActionInput {
  actorAccountId: string | null;
  targetAccountId: string;
  action: AuditAction;
  meta?: Record<string, unknown>;
}

const assertNonSensitiveMeta = (meta?: Record<string, unknown>): void => {
  if (!meta) return;
  for (const key of Object.keys(meta)) {
    if (SENSITIVE_KEY.test(key)) {
      throw new Error(`audit meta 不得包含敏感欄位：${key}`);
    }
  }
};

export const recordAction = async (input: RecordActionInput, db?: Db): Promise<AuditLog> => {
  assertNonSensitiveMeta(input.meta);
  return auditRepository.append(
    {
      actorAccountId: input.actorAccountId,
      targetAccountId: input.targetAccountId,
      action: input.action,
      ...(input.meta ? { meta: input.meta as Prisma.InputJsonValue } : {}),
    },
    db,
  );
};
