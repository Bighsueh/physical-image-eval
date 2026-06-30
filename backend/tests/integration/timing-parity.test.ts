import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { makeReviewer } from '../helpers/factories';

/**
 * SC-004 / D6 — login failure must be indistinguishable across unknown / active-wrong-password /
 * disabled accounts, in BOTH body and timing. The unknown-user path runs a real argon2 dummy
 * verify, so no class should be dramatically faster (a short-circuit would leak existence).
 */
const login = (username: string, password: string) =>
  request(app).post('/api/auth/login').send({ username, password });

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const timeOnce = async (username: string, password: string): Promise<number> => {
  const start = performance.now();
  const res = await login(username, password);
  const elapsed = performance.now() - start;
  expect(res.status).toBe(401);
  return elapsed;
};

describe('login timing + body parity (SC-004, D6)', () => {
  it('has identical bodies and comparable timing across the three failure classes', async () => {
    await makeReviewer({ username: 'active.user', password: 'correct-pass-1' });
    await makeReviewer({ username: 'disabled.user', password: 'correct-pass-2', isActive: false });

    const SAMPLES = 7;
    // warm up (argon2 + JIT)
    await login('warmup', 'x');

    const classes: Record<string, () => Promise<number>> = {
      unknown: () => timeOnce('ghost-user', 'whatever'),
      wrongPassword: () => timeOnce('active.user', 'wrong-pass'),
      disabled: () => timeOnce('disabled.user', 'correct-pass-2'),
    };

    const medians: Record<string, number> = {};
    for (const [name, fn] of Object.entries(classes)) {
      const samples: number[] = [];
      for (let i = 0; i < SAMPLES; i += 1) samples.push(await fn());
      medians[name] = median(samples);
    }

    const values = Object.values(medians);
    const ratio = Math.max(...values) / Math.max(1, Math.min(...values));
    // Generous bound — argon2 (~tens of ms) dominates all three paths. A missing dummy-verify
    // would make the unknown path ~instant and blow this ratio far past the bound.
    expect(ratio).toBeLessThan(4);

    // Body parity: all three identical generic failures.
    const bodies = await Promise.all([
      login('ghost-user', 'whatever'),
      login('active.user', 'wrong-pass'),
      login('disabled.user', 'correct-pass-2'),
    ]);
    for (const res of bodies) {
      expect(res.body).toEqual({
        success: false,
        data: null,
        error: { code: 'AUTH_FAILED', message: '帳號或密碼錯誤' },
      });
    }
  });
});
