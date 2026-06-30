import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { issueSession } from '../../src/services/session.service';
import { makeReviewer } from '../helpers/factories';

const sessionReq = (token: string) =>
  request(app).get('/api/auth/session').set('Cookie', `pie_sid=${token}`);

describe('GET /api/auth/session (US5)', () => {
  it('restores a valid session: account + re-emitted pie_csrf (FR-016)', async () => {
    const { account } = await makeReviewer({ username: 'dr.lin', displayName: '林醫師' });
    const { token } = await issueSession(account.id);

    const res = await sessionReq(token);
    expect(res.status).toBe(200);
    expect(res.body.data.account).toMatchObject({ username: 'dr.lin', role: 'REVIEWER' });
    expect(res.body.data.account.passwordHash).toBeUndefined();
    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies.some((c) => c.startsWith('pie_csrf='))).toBe(true);
  });

  it('rejects an idle-timed-out session with 401 (FR-015)', async () => {
    const { account } = await makeReviewer();
    const { token, session } = await issueSession(account.id);
    // lastSeenAt 61 min ago > 60 min idle TTL
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(Date.now() - 61 * 60_000) },
    });
    const res = await sessionReq(token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects an absolutely-expired session with 401 (FR-015)', async () => {
    const { account } = await makeReviewer();
    const { token, session } = await issueSession(account.id);
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const res = await sessionReq(token);
    expect(res.status).toBe(401);
  });

  it('rejects a revoked session with 401 (FR-017)', async () => {
    const { account } = await makeReviewer();
    const { token, session } = await issueSession(account.id);
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const res = await sessionReq(token);
    expect(res.status).toBe(401);
  });

  it('returns 401 when no session cookie is present', async () => {
    const res = await request(app).get('/api/auth/session');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });
});
