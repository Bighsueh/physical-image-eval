import { describe, expect, it } from 'vitest';
import { hashToken } from '../../src/lib/tokens';
import { prisma } from '../../src/lib/prisma';
import {
  isSessionValid,
  issueSession,
  revokeAllForAccount,
  revokeSession,
  validateToken,
} from '../../src/services/session.service';
import { makeReviewer } from '../helpers/factories';

const HOUR = 3_600_000;

describe('session.service — validity rule (pure, D2)', () => {
  const base = { revokedAt: null as Date | null, expiresAt: new Date(Date.now() + HOUR), lastSeenAt: new Date() };

  it('a fresh, unrevoked, in-window session is valid', () => {
    expect(isSessionValid(base)).toBe(true);
  });

  it('a revoked session is invalid', () => {
    expect(isSessionValid({ ...base, revokedAt: new Date() })).toBe(false);
  });

  it('a session past absolute expiry is invalid', () => {
    expect(isSessionValid({ ...base, expiresAt: new Date(Date.now() - 1_000) })).toBe(false);
  });

  it('a session idle beyond the idle TTL is invalid (lastSeenAt 61 min ago)', () => {
    expect(isSessionValid({ ...base, lastSeenAt: new Date(Date.now() - 61 * 60_000) })).toBe(false);
  });
});

describe('session.service — issue / validate / revoke (DB, D1)', () => {
  it('issues a session storing only the token hash (raw token never persisted)', async () => {
    const { account } = await makeReviewer();
    const { token, csrfToken, session } = await issueSession(account.id);

    expect(token).toBeTruthy();
    expect(csrfToken).toBeTruthy();
    const row = await prisma.session.findUnique({ where: { id: session.id } });
    expect(row?.tokenHash).toBe(hashToken(token));
    expect(row?.tokenHash).not.toBe(token); // hashed at rest
    expect(row?.accountId).toBe(account.id);
  });

  it('validateToken resolves a valid session with its account', async () => {
    const { account } = await makeReviewer();
    const { token } = await issueSession(account.id);
    const resolved = await validateToken(token);
    expect(resolved?.account.id).toBe(account.id);
  });

  it('validateToken returns null for an unknown token', async () => {
    expect(await validateToken('not-a-real-token')).toBeNull();
  });

  it('revokeSession invalidates the session immediately (FR-018)', async () => {
    const { account } = await makeReviewer();
    const { token, session } = await issueSession(account.id);
    await revokeSession(session.id);
    expect(await validateToken(token)).toBeNull();
  });

  it('revokeAllForAccount revokes every active session of the account (FR-017)', async () => {
    const { account } = await makeReviewer();
    const a = await issueSession(account.id);
    const b = await issueSession(account.id);
    const count = await revokeAllForAccount(account.id);
    expect(count).toBe(2);
    expect(await validateToken(a.token)).toBeNull();
    expect(await validateToken(b.token)).toBeNull();
  });
});
