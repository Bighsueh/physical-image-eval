import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { requireRole } from '../../src/middleware/require-role';

/** Unit test for the role gate, independent of any UI state (FR-011, SC-001). */
const run = (gateRole: 'ADMIN' | 'REVIEWER', auth?: { account: { role: string } }) => {
  const req = { auth } as unknown as Request;
  let captured: unknown;
  requireRole(gateRole)(req, {} as Response, (err?: unknown) => {
    captured = err;
  });
  return captured;
};

describe('require-role middleware (US4)', () => {
  it('passes (no error) when the role matches', () => {
    expect(run('ADMIN', { account: { role: 'ADMIN' } })).toBeUndefined();
  });

  it('blocks a mismatched role with 403 FORBIDDEN_ROLE', () => {
    const err = run('ADMIN', { account: { role: 'REVIEWER' } });
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('FORBIDDEN_ROLE');
    expect((err as AppError).status).toBe(403);
  });

  it('requires auth when no account is present', () => {
    const err = run('ADMIN', undefined);
    expect((err as AppError).code).toBe('AUTH_REQUIRED');
  });
});
