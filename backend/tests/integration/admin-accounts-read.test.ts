import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { makeReviewer } from '../helpers/factories';
import { adminAgent } from '../helpers/http';

describe('GET /api/admin/accounts (US2)', () => {
  it('lists accounts with a meta envelope and never exposes passwordHash', async () => {
    const { agent, account: admin } = await adminAgent(app);
    await makeReviewer({ username: 'rev.a', displayName: '甲醫師' });
    await makeReviewer({ username: 'rev.b', displayName: '乙醫師' });

    const res = await agent.get('/api/admin/accounts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ total: expect.any(Number), count: expect.any(Number) });
    expect(res.body.data.length).toBeGreaterThanOrEqual(3); // admin + 2 reviewers
    for (const acc of res.body.data) {
      expect(acc.passwordHash).toBeUndefined();
    }
    expect(res.body.data.some((a: { id: string }) => a.id === admin.id)).toBe(true);
  });

  it('filters by role and isActive', async () => {
    const { agent } = await adminAgent(app);
    await makeReviewer({ username: 'rev.active' });
    await makeReviewer({ username: 'rev.disabled', isActive: false });

    const reviewers = await agent.get('/api/admin/accounts?role=REVIEWER');
    expect(reviewers.body.data.every((a: { role: string }) => a.role === 'REVIEWER')).toBe(true);

    const disabled = await agent.get('/api/admin/accounts?isActive=false');
    expect(disabled.body.data.every((a: { isActive: boolean }) => a.isActive === false)).toBe(true);
    expect(disabled.body.data.some((a: { username: string }) => a.username === 'rev.disabled')).toBe(true);
  });

  it('searches by q across username/displayName', async () => {
    const { agent } = await adminAgent(app);
    await makeReviewer({ username: 'searchme', displayName: '可搜尋醫師' });
    const res = await agent.get('/api/admin/accounts?q=可搜尋');
    expect(res.body.data.some((a: { username: string }) => a.username === 'searchme')).toBe(true);
  });
});

describe('GET /api/admin/accounts/:id (US2)', () => {
  it('returns one account detail (no hash)', async () => {
    const { agent } = await adminAgent(app);
    const { account } = await makeReviewer({ username: 'detail.me', displayName: '明細醫師' });
    const res = await agent.get(`/api/admin/accounts/${account.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: account.id, username: 'detail.me' });
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('returns 404 ACCOUNT_NOT_FOUND for an unknown id', async () => {
    const { agent } = await adminAgent(app);
    const res = await agent.get('/api/admin/accounts/ckdoesnotexist0000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });
});
