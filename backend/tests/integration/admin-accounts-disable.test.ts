import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { makeAdmin, makeReviewer } from '../helpers/factories';
import { issueSession } from '../../src/services/session.service';
import { adminAgent } from '../helpers/http';

describe('POST /api/admin/accounts/:id/disable (US2)', () => {
  it('disables, revokes all target sessions, preserves the account, writes DISABLE audit', async () => {
    const { agent, csrf } = await adminAgent(app);
    const { account: reviewer } = await makeReviewer({ username: 'leaving' });
    await issueSession(reviewer.id);
    await issueSession(reviewer.id);

    const res = await agent.post(`/api/admin/accounts/${reviewer.id}/disable`).set('X-CSRF-Token', csrf);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    // sessions revoked (FR-017)
    expect(await prisma.session.count({ where: { accountId: reviewer.id, revokedAt: null } })).toBe(0);
    // account NOT deleted (FR-008 — records preserved)
    expect(await prisma.account.findUnique({ where: { id: reviewer.id } })).not.toBeNull();
    // audit
    const audit = await prisma.auditLog.findMany({ where: { targetAccountId: reviewer.id } });
    expect(audit.map((a) => a.action)).toContain('DISABLE_ACCOUNT');
  });

  it('is idempotent — disabling an already-disabled account returns 200', async () => {
    const { agent, csrf } = await adminAgent(app);
    const { account: reviewer } = await makeReviewer({ isActive: false });
    const res = await agent.post(`/api/admin/accounts/${reviewer.id}/disable`).set('X-CSRF-Token', csrf);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('refuses self-disable when other admins exist (409 SELF_OPERATION_FORBIDDEN)', async () => {
    const { agent, csrf, account: actor } = await adminAgent(app);
    await makeAdmin({ username: 'other.admin' }); // keeps the system non-last-admin
    const res = await agent.post(`/api/admin/accounts/${actor.id}/disable`).set('X-CSRF-Token', csrf);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SELF_OPERATION_FORBIDDEN');
  });

  it('refuses to disable the last active admin (409 LAST_ADMIN_PROTECTED)', async () => {
    const { agent, csrf, account: soleAdmin } = await adminAgent(app); // the only admin
    const res = await agent.post(`/api/admin/accounts/${soleAdmin.id}/disable`).set('X-CSRF-Token', csrf);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LAST_ADMIN_PROTECTED');
  });

  it('returns 404 for an unknown account', async () => {
    const { agent, csrf } = await adminAgent(app);
    const res = await agent.post('/api/admin/accounts/ckmissing000000000000000/disable').set('X-CSRF-Token', csrf);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });
});
