import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { makeAdmin, makeReviewer } from '../helpers/factories';

const setCookies = (res: request.Response): string[] =>
  (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

describe('POST /api/auth/login (US1)', () => {
  it('logs in a reviewer → 200, sets cookies, redirect=/progress, no hash leaked', async () => {
    const { password } = await makeReviewer({ username: 'dr.lin', displayName: '林醫師' });
    const res = await request(app).post('/api/auth/login').send({ username: 'dr.lin', password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.account).toMatchObject({
      username: 'dr.lin',
      displayName: '林醫師',
      role: 'REVIEWER',
      mustChangePassword: false,
    });
    expect(res.body.data.account.passwordHash).toBeUndefined();
    expect(res.body.data.redirect).toBe('/progress');

    const cookies = setCookies(res);
    const sid = cookies.find((c) => c.startsWith('pie_sid='));
    expect(sid).toBeTruthy();
    expect(sid).toMatch(/HttpOnly/i);
    expect(sid).toMatch(/SameSite=Lax/i);
    expect(cookies.some((c) => c.startsWith('pie_csrf='))).toBe(true);
  });

  it('accepts a case-insensitive username', async () => {
    const { password } = await makeReviewer({ username: 'dr.lin' });
    const res = await request(app).post('/api/auth/login').send({ username: 'DR.LIN', password });
    expect(res.status).toBe(200);
    expect(res.body.data.account.username).toBe('dr.lin');
  });

  it('redirects an admin to /admin/accounts', async () => {
    const { password } = await makeAdmin({ username: 'admin1' });
    const res = await request(app).post('/api/auth/login').send({ username: 'admin1', password });
    expect(res.body.data.redirect).toBe('/admin/accounts');
    expect(res.body.data.account.role).toBe('ADMIN');
  });

  it('redirects a must-change-password account to /password/change', async () => {
    const { password } = await makeReviewer({ username: 'newbie', mustChangePassword: true });
    const res = await request(app).post('/api/auth/login').send({ username: 'newbie', password });
    expect(res.body.data.redirect).toBe('/password/change');
    expect(res.body.data.account.mustChangePassword).toBe(true);
  });

  it('rejects missing fields with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
