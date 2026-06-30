import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { isSessionValid, issueSession, validateToken } from '../../src/services/session.service';
import { makeReviewer } from '../helpers/factories';

const HOUR = 3_600_000;
const fresh = { revokedAt: null as Date | null, expiresAt: new Date(Date.now() + HOUR), lastSeenAt: new Date() };

describe('session validity boundaries (US5, D2)', () => {
  it('is valid just under the idle TTL and invalid just over', () => {
    const now = new Date();
    const justUnder = { ...fresh, lastSeenAt: new Date(now.getTime() - 59 * 60_000) };
    const justOver = { ...fresh, lastSeenAt: new Date(now.getTime() - 60 * 60_000 - 1) };
    expect(isSessionValid(justUnder, now)).toBe(true);
    expect(isSessionValid(justOver, now)).toBe(false);
  });

  it('is invalid exactly at the absolute expiry instant', () => {
    const now = new Date();
    expect(isSessionValid({ ...fresh, expiresAt: now }, now)).toBe(false);
  });
});

describe('throttled lastSeenAt refresh (US5, D2)', () => {
  it('refreshes lastSeenAt when it is older than the 1-min throttle', async () => {
    const { account } = await makeReviewer();
    const { token, session } = await issueSession(account.id);
    const stale = new Date(Date.now() - 90_000); // 90s ago > 60s throttle
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: stale } });

    await validateToken(token);
    const after = await prisma.session.findUnique({ where: { id: session.id } });
    expect(after!.lastSeenAt.getTime()).toBeGreaterThan(stale.getTime());
  });

  it('does NOT refresh lastSeenAt within the throttle window', async () => {
    const { account } = await makeReviewer();
    const { token, session } = await issueSession(account.id);
    const recent = new Date(Date.now() - 30_000); // 30s ago < 60s throttle
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: recent } });

    await validateToken(token);
    const after = await prisma.session.findUnique({ where: { id: session.id } });
    expect(after!.lastSeenAt.getTime()).toBe(recent.getTime());
  });
});
