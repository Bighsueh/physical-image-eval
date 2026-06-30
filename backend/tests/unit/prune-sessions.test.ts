import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { pruneExpiredSessions } from '../../src/jobs/prune-sessions';
import { issueSession } from '../../src/services/session.service';
import { makeReviewer } from '../helpers/factories';

describe('pruneExpiredSessions (T099)', () => {
  it('removes absolutely-expired sessions but keeps valid ones', async () => {
    const { account } = await makeReviewer();
    const valid = await issueSession(account.id);
    const expired = await issueSession(account.id);
    await prisma.session.update({
      where: { id: expired.session.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const removed = await pruneExpiredSessions();
    expect(removed).toBe(1);
    expect(await prisma.session.findUnique({ where: { id: valid.session.id } })).not.toBeNull();
    expect(await prisma.session.findUnique({ where: { id: expired.session.id } })).toBeNull();
  });

  it('removes sessions revoked long ago but keeps recently-revoked ones', async () => {
    const { account } = await makeReviewer();
    const recent = await issueSession(account.id);
    const old = await issueSession(account.id);
    await prisma.session.update({
      where: { id: recent.session.id },
      data: { revokedAt: new Date() },
    });
    await prisma.session.update({
      where: { id: old.session.id },
      data: { revokedAt: new Date(Date.now() - 2 * 24 * 3_600_000) },
    });

    const removed = await pruneExpiredSessions();
    expect(removed).toBe(1);
    expect(await prisma.session.findUnique({ where: { id: recent.session.id } })).not.toBeNull();
    expect(await prisma.session.findUnique({ where: { id: old.session.id } })).toBeNull();
  });
});
