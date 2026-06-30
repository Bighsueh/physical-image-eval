import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ok } from '../../src/lib/envelope';
import { makeLoginRateLimiter } from '../../src/middleware/rate-limit';

/** Build a tiny app with a low-max limiter to exercise the 429 path in isolation (FR-021, D8). */
const buildApp = (max: number) => {
  const app = express();
  app.use(express.json());
  app.post('/login', makeLoginRateLimiter(max, 60_000), (_req, res) => res.json(ok({ ok: true })));
  return app;
};

describe('login rate limiter (FR-021, D8)', () => {
  it('returns 429 RATE_LIMITED with generic copy after the limit (no enumeration signal)', async () => {
    const app = buildApp(1);
    const first = await request(app).post('/login').send({ username: 'a', password: 'x' });
    expect(first.status).toBe(200);
    const second = await request(app).post('/login').send({ username: 'a', password: 'x' });
    expect(second.status).toBe(429);
    expect(second.body.error).toEqual({
      code: 'RATE_LIMITED',
      message: '嘗試次數過多，請稍後再試',
    });
  });

  it('keys by username — a different username keeps its own budget', async () => {
    const app = buildApp(1);
    await request(app).post('/login').send({ username: 'a', password: 'x' });
    const other = await request(app).post('/login').send({ username: 'b', password: 'x' });
    expect(other.status).toBe(200);
  });
});
