import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { makeReviewer } from '../helpers/factories';
import { issueSession } from '../../src/services/session.service';
import { adminAgent } from '../helpers/http';

describe('POST /api/admin/accounts/:id/reset-credential (US2)', () => {
  it('returns a new one-time tempPassword, forces change, revokes all sessions, writes RESET audit', async () => {
    const { agent, csrf } = await adminAgent(app);
    const { account: reviewer, password: oldPassword } = await makeReviewer({ username: 'forgot.pw' });
    await issueSession(reviewer.id);

    const res = await agent
      .post(`/api/admin/accounts/${reviewer.id}/reset-credential`)
      .set('X-CSRF-Token', csrf);

    expect(res.status).toBe(200);
    expect(res.body.data.account.mustChangePassword).toBe(true);
    expect(typeof res.body.data.tempPassword).toBe('string');

    // all sessions revoked (FR-017)
    expect(await prisma.session.count({ where: { accountId: reviewer.id, revokedAt: null } })).toBe(0);

    // old password no longer works; the new temp password does
    const oldLogin = await request(app).post('/api/auth/login').send({ username: 'forgot.pw', password: oldPassword });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'forgot.pw', password: res.body.data.tempPassword });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.data.redirect).toBe('/password/change');

    const audit = await prisma.auditLog.findMany({ where: { targetAccountId: reviewer.id } });
    expect(audit.map((a) => a.action)).toContain('RESET_CREDENTIAL');
  });

  it('keeps a disabled account disabled (no implicit enable)', async () => {
    const { agent, csrf } = await adminAgent(app);
    const { account: reviewer } = await makeReviewer({ isActive: false });
    const res = await agent
      .post(`/api/admin/accounts/${reviewer.id}/reset-credential`)
      .set('X-CSRF-Token', csrf);
    expect(res.status).toBe(200);
    expect(res.body.data.account.isActive).toBe(false);
  });

  it('refuses resetting own account (409 SELF_OPERATION_FORBIDDEN)', async () => {
    const { agent, csrf, account: actor } = await adminAgent(app);
    const res = await agent
      .post(`/api/admin/accounts/${actor.id}/reset-credential`)
      .set('X-CSRF-Token', csrf);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SELF_OPERATION_FORBIDDEN');
  });
});
