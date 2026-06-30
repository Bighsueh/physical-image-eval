import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';

/**
 * US3 / FR-014 — unauthenticated access to any protected route is refused with 401 AUTH_REQUIRED
 * (the SPA translates this into a redirect to /login). No protected content ever leaks.
 */
const send = (method: 'get' | 'post', path: string) =>
  method === 'get' ? request(app).get(path) : request(app).post(path).send({});

describe('protected routes require authentication (US3)', () => {
  const cases: Array<['get' | 'post', string]> = [
    ['get', '/api/admin/accounts'],
    ['post', '/api/admin/accounts'],
    ['get', '/api/admin/accounts/some-id'],
    ['post', '/api/admin/accounts/some-id/disable'],
    ['post', '/api/admin/accounts/some-id/enable'],
    ['post', '/api/admin/accounts/some-id/reset-credential'],
    ['post', '/api/auth/password'],
  ];

  it.each(cases)('%s %s without a session → 401 AUTH_REQUIRED', async (method, path) => {
    const res = await send(method, path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });
});
