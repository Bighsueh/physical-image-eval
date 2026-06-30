import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { makeAdmin, makeReviewer } from '../helpers/factories';
import { adminAgent, reviewerAgent } from '../helpers/http';

/**
 * US4 — every protected capability is authorized at the server boundary (FR-011/FR-012/FR-013,
 * SC-001/SC-008). A reviewer is refused on EVERY admin route regardless of UI; admins land on the
 * admin home and are not part of the reviewer set.
 */
const ADMIN_ROUTES: Array<['get' | 'post', string]> = [
  ['get', '/api/admin/accounts'],
  ['post', '/api/admin/accounts'],
  ['get', '/api/admin/accounts/any-id'],
  ['post', '/api/admin/accounts/any-id/disable'],
  ['post', '/api/admin/accounts/any-id/enable'],
  ['post', '/api/admin/accounts/any-id/reset-credential'],
];

describe('reviewer is blocked from every admin route (server-side)', () => {
  it.each(ADMIN_ROUTES)('reviewer %s %s → 403 FORBIDDEN_ROLE', async (method, path) => {
    const { agent, csrf } = await reviewerAgent(app);
    const res =
      method === 'get'
        ? await agent.get(path)
        : await agent.post(path).set('X-CSRF-Token', csrf).send({ displayName: 'x', username: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('a reviewer cannot read another account detail', async () => {
    const { agent } = await reviewerAgent(app);
    const { account: other } = await makeReviewer({ username: 'someone.else' });
    const res = await agent.get(`/api/admin/accounts/${other.id}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });
});

describe('admins are separated from reviewers', () => {
  it('admin login lands on /admin/accounts, not the reviewer progress page', async () => {
    const { account, password } = await makeAdmin({ username: 'an.admin' });
    const res = await request(app).post('/api/auth/login').send({ username: account.username, password });
    expect(res.body.data.redirect).toBe('/admin/accounts');
    expect(res.body.data.account.role).toBe('ADMIN');
  });

  it('admins are not in the reviewer set (role=REVIEWER filter excludes them)', async () => {
    const { agent, account: admin } = await adminAgent(app);
    await makeReviewer({ username: 'a.reviewer' });
    const res = await agent.get('/api/admin/accounts?role=REVIEWER');
    expect(res.body.data.every((a: { role: string }) => a.role === 'REVIEWER')).toBe(true);
    expect(res.body.data.some((a: { id: string }) => a.id === admin.id)).toBe(false);
  });
});
