import type { Db } from '../lib/prisma';
import { prisma } from '../lib/prisma';

/**
 * Optional housekeeping (T099): delete sessions that can never be valid again — past absolute
 * expiry, or revoked a while ago. Uses the expiresAt index. Safe to run on a cron; not required
 * for correctness (validity is always derived per request).
 */
export const pruneExpiredSessions = async (
  now: Date = new Date(),
  db: Db = prisma,
): Promise<number> => {
  const revokedCutoff = new Date(now.getTime() - 24 * 3_600_000); // keep revoked rows ~1 day
  const result = await db.session.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: revokedCutoff } }],
    },
  });
  return result.count;
};
