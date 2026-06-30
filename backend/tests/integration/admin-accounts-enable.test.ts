import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { makeReviewer } from '../helpers/factories';
import { adminAgent } from '../helpers/http';

describe('POST /api/admin/accounts/:id/enable (US2)', () => {
  it('re-enables a disabled account, writes ENABLE audit, issues NO new credential', async () => {
    const { agent, csrf } = await adminAgent(app);
    const { account: reviewer } = await makeReviewer({ isActive: false });
    const hashBefore = (await prisma.account.findUnique({ where: { id: reviewer.id } }))!.passwordHash;

    const res = await agent.post(`/api/admin/accounts/${reviewer.id}/enable`).set('X-CSRF-Token', csrf);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.tempPassword).toBeUndefined(); // enable never returns a credential

    const after = await prisma.account.findUnique({ where: { id: reviewer.id } });
    expect(after!.passwordHash).toBe(hashBefore); // credential untouched

    const audit = await prisma.auditLog.findMany({ where: { targetAccountId: reviewer.id } });
    expect(audit.map((a) => a.action)).toContain('ENABLE_ACCOUNT');
  });

  it('is idempotent — enabling an already-active account returns 200', async () => {
    const { agent, csrf } = await adminAgent(app);
    const { account: reviewer } = await makeReviewer(); // active
    const res = await agent.post(`/api/admin/accounts/${reviewer.id}/enable`).set('X-CSRF-Token', csrf);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });
});
