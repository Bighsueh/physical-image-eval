import type { Session } from '@prisma/client';
import { env } from '../config/env';
import type { Db } from '../lib/prisma';
import { generateCsrfToken, generateSessionToken, hashToken } from '../lib/tokens';
import {
  sessionRepository,
  type SessionWithAccount,
} from '../repositories/session.repository';

/**
 * Session lifecycle (research D1/D2). Issues opaque tokens (hashed at rest), validates with an
 * absolute + sliding-idle rule, refreshes lastSeenAt at most once/min, and revokes single or all
 * sessions (FR-015..FR-018).
 */

const LAST_SEEN_THROTTLE_MS = 60_000;

export interface IssuedSession {
  token: string; // raw, set in pie_sid cookie only
  csrfToken: string; // set in pie_csrf cookie
  session: Session;
}

/** Create a new session for an account. Absolute expiry = now + SESSION_ABSOLUTE_TTL. */
export const issueSession = async (accountId: string, db?: Db): Promise<IssuedSession> => {
  const token = generateSessionToken();
  const csrfToken = generateCsrfToken();
  const expiresAt = new Date(Date.now() + env.SESSION_ABSOLUTE_TTL);
  const session = await sessionRepository.create(
    { tokenHash: hashToken(token), accountId, csrfToken, expiresAt },
    db,
  );
  return { token, csrfToken, session };
};

type ValidityFields = Pick<Session, 'revokedAt' | 'expiresAt' | 'lastSeenAt'>;

/** Pure validity rule: not revoked AND now < expiresAt AND now < lastSeenAt + IDLE_TTL (D2). */
export const isSessionValid = (session: ValidityFields, now: Date = new Date()): boolean => {
  if (session.revokedAt !== null) return false;
  if (now.getTime() >= session.expiresAt.getTime()) return false;
  if (now.getTime() >= session.lastSeenAt.getTime() + env.SESSION_IDLE_TTL) return false;
  return true;
};

/**
 * Resolve a raw cookie token to a valid session + account, or null. Refreshes the sliding idle
 * marker at most once per minute to avoid write churn (D2).
 */
export const validateToken = async (
  rawToken: string,
  db?: Db,
): Promise<SessionWithAccount | null> => {
  const found = await sessionRepository.findByTokenHash(hashToken(rawToken), db);
  if (!found) return null;

  const now = new Date();
  if (!isSessionValid(found, now)) return null;

  if (now.getTime() - found.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await sessionRepository.touchLastSeen(found.id, now, db);
    found.lastSeenAt = now;
  }
  return found;
};

export const revokeSession = (sessionId: string, db?: Db): Promise<void> =>
  sessionRepository.revoke(sessionId, new Date(), db);

export const revokeAllForAccount = (
  accountId: string,
  db?: Db,
  exceptSessionId?: string,
): Promise<number> =>
  sessionRepository.revokeAllForAccount(accountId, new Date(), db, exceptSessionId);
