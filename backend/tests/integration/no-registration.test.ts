import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';

/**
 * US3 / SC-002 / FR-005 / FR-020 — there is NO self-registration surface. Every plausible
 * create-account path returns a 404 envelope, never a registration form.
 */
const REGISTRATION_PATHS = [
  '/api/auth/register',
  '/api/signup',
  '/api/accounts',
  '/api/auth/request-account',
  '/api/register',
  '/api/auth/signup',
];

describe('no registration surface (US3)', () => {
  it.each(REGISTRATION_PATHS)('POST %s → 404 envelope (no registration form)', async (path) => {
    const res = await request(app).post(path).send({ username: 'x', password: 'y' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: '找不到資源' },
    });
  });

  it.each(REGISTRATION_PATHS)('GET %s → 404', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
