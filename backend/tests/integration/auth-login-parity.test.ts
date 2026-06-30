import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { makeReviewer } from '../helpers/factories';

const login = (username: string, password: string) =>
  request(app).post('/api/auth/login').send({ username, password });

describe('login failure parity (FR-004, SC-004, US1)', () => {
  it('unknown / wrong-password / disabled return an IDENTICAL 401 with no cookies', async () => {
    await makeReviewer({ username: 'active.user', password: 'correct-pass-1' });
    await makeReviewer({ username: 'disabled.user', password: 'correct-pass-2', isActive: false });

    const unknown = await login('ghost', 'whatever');
    const wrong = await login('active.user', 'wrong-pass');
    const disabled = await login('disabled.user', 'correct-pass-2');

    for (const res of [unknown, wrong, disabled]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        data: null,
        error: { code: 'AUTH_FAILED', message: '帳號或密碼錯誤' },
      });
      expect(res.headers['set-cookie']).toBeUndefined();
    }

    // Byte-for-byte identical bodies across the three classes.
    expect(unknown.body).toEqual(wrong.body);
    expect(wrong.body).toEqual(disabled.body);
  });
});
