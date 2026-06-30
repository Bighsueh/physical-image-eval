import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';

describe('app-level error handling + health', () => {
  it('health check returns an ok envelope', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ success: true, data: { status: 'ok' }, error: null });
  });

  it('a malformed JSON body → 400 VALIDATION_ERROR (not a 500)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
