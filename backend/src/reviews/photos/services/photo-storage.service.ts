import { prisma } from '../../../lib/prisma';
import { env } from '../../../config/env';

/**
 * Photo storage accounting (FR-061, research D18).
 *
 * The ceiling constrains the **photo upload path only**. Review submission, autosave, panel
 * annotation, deletion and viewing must all keep working when the store is full — a quota
 * that halts the review task would turn a capacity problem into an outage (SC-020).
 *
 * Usage sums the denormalized byte columns on `ReviewPhoto`, never the blob table, so this
 * aggregate stays cheap no matter how much data it is measuring (research D11).
 */
export const WARN_THRESHOLD = 0.8;

export type UsageWarning = 'none' | 'approaching' | 'full';

export interface UsageClassification {
  usedBytes: number;
  limitBytes: number;
  usedPercent: number;
  warning: UsageWarning;
  isFull: boolean;
}

/** Pure — the arithmetic is separated from the query so it is testable without a database. */
export function classifyUsage(usedBytes: number, limitBytes: number): UsageClassification {
  const usedPercent = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0;
  const isFull = usedBytes >= limitBytes;
  const warning: UsageWarning = isFull
    ? 'full'
    : usedBytes >= limitBytes * WARN_THRESHOLD
      ? 'approaching'
      : 'none';
  return { usedBytes, limitBytes, usedPercent, warning, isFull };
}

/**
 * Total bytes held by every photo — drafts included, because disk is consumed regardless of
 * review status. This is the one place a draft photo is counted; every other photo number in
 * the system is submitted-only (004 data-model).
 */
export async function currentUsageBytes(): Promise<number> {
  const agg = await prisma.reviewPhoto.aggregate({
    _sum: { originalByteSize: true, displayByteSize: true, annotatedByteSize: true },
  });
  return (
    (agg._sum.originalByteSize ?? 0) +
    (agg._sum.displayByteSize ?? 0) +
    (agg._sum.annotatedByteSize ?? 0)
  );
}

export async function getUsage(): Promise<UsageClassification> {
  return classifyUsage(await currentUsageBytes(), env.PHOTO_STORAGE_LIMIT_BYTES);
}
