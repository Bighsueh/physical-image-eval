import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { adminAgent } from '../helpers/http';

/**
 * Admin-set password + batch create/delete (2026-07-01 clarification). The single-create path
 * gains an optional `password` (no forced first-login change); batch endpoints do best-effort
 * per-item processing and never let one bad row fail the rest.
 */
describe('POST /api/admin/accounts with explicit password', () => {
  it('creates the account with the admin-set password → mustChangePassword=false, no tempPassword', async () => {
    const { agent, csrf } = await adminAgent(app);
    const res = await agent
      .post('/api/admin/accounts')
      .set('X-CSRF-Token', csrf)
      .send({ displayName: '張醫師', username: 'dr.set1', role: 'REVIEWER', password: 'clinic2026' });

    expect(res.status).toBe(201);
    expect(res.body.data.account.mustChangePassword).toBe(false);
    expect(res.body.data.tempPassword).toBeNull();

    // The chosen password lets the reviewer log in directly (no forced change interstitial).
    const login = await agent.post('/api/auth/login').send({ username: 'dr.set1', password: 'clinic2026' });
    expect(login.status).toBe(200);
  });

  it('rejects a password shorter than the policy minimum (400 VALIDATION_ERROR)', async () => {
    const { agent, csrf } = await adminAgent(app);
    const res = await agent
      .post('/api/admin/accounts')
      .set('X-CSRF-Token', csrf)
      .send({ displayName: 'X', username: 'shortpw', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/admin/accounts/batch', () => {
  it('creates all valid rows and reports a duplicate as a per-item failure (partial success)', async () => {
    const { agent, csrf } = await adminAgent(app);
    await agent.post('/api/admin/accounts').set('X-CSRF-Token', csrf).send({ displayName: '既有', username: 'b.dup' });

    const res = await agent
      .post('/api/admin/accounts/batch')
      .set('X-CSRF-Token', csrf)
      .send({
        accounts: [
          { displayName: '甲', username: 'b.a', role: 'REVIEWER', password: 'aaaaaa' },
          { displayName: '重複', username: 'b.dup', role: 'REVIEWER' },
          { displayName: '乙', username: 'b.b', role: 'REVIEWER' },
        ],
      });

    expect(res.status).toBe(201);
    const results = res.body.data.results as Array<{ username: string; success: boolean; tempPassword: string | null; error: string | null }>;
    expect(results.map((r) => r.success)).toEqual([true, false, true]);
    expect(results[0].tempPassword).toBeNull(); // admin-set
    expect(results[2].tempPassword).toMatch(/^\d{6}$/); // system temp
    expect(results[1].error).toContain('已存在');
    expect(await prisma.account.count({ where: { username: { in: ['b.a', 'b.b'] } } })).toBe(2);
  });

  it('rejects an empty batch (400 VALIDATION_ERROR)', async () => {
    const { agent, csrf } = await adminAgent(app);
    const res = await agent.post('/api/admin/accounts/batch').set('X-CSRF-Token', csrf).send({ accounts: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires CSRF (403)', async () => {
    const { agent } = await adminAgent(app);
    const res = await agent.post('/api/admin/accounts/batch').send({ accounts: [{ displayName: 'X', username: 'nc' }] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });
});

describe('POST /api/admin/accounts/batch-delete', () => {
  it('deletes accounts with no submitted reviews and blocks those with submitted reviews', async () => {
    const { agent, csrf } = await adminAgent(app);
    const clean = await prisma.account.create({
      data: { username: 'bd.clean', displayName: '可刪', role: 'REVIEWER', passwordHash: 'x' },
      select: { id: true },
    });
    const submitted = await prisma.account.create({
      data: { username: 'bd.submitted', displayName: '有審查', role: 'REVIEWER', passwordHash: 'x' },
      select: { id: true },
    });
    await prisma.review.create({
      data: {
        reviewerId: submitted.id,
        blueprintCode: 'S1',
        status: 'SUBMITTED',
        overallJudgement: 'PASS',
        submittedAt: new Date(),
        panels: { create: [1, 2, 3, 4].map((panelIndex) => ({ panelIndex, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null })) },
      },
    });

    const res = await agent
      .post('/api/admin/accounts/batch-delete')
      .set('X-CSRF-Token', csrf)
      .send({ accountIds: [clean.id, submitted.id] });

    expect(res.status).toBe(200);
    const results = res.body.data.results as Array<{ accountId: string; success: boolean; error?: string }>;
    expect(results.find((r) => r.accountId === clean.id)?.success).toBe(true);
    expect(results.find((r) => r.accountId === submitted.id)?.success).toBe(false);
    expect(await prisma.account.findUnique({ where: { id: clean.id } })).toBeNull();
    expect(await prisma.account.findUnique({ where: { id: submitted.id } })).not.toBeNull();
  });

  it('collapses duplicate ids so a repeated id yields a single result (not a misleading NOT_FOUND)', async () => {
    const { agent, csrf } = await adminAgent(app);
    const acc = await prisma.account.create({
      data: { username: 'bd.dupid', displayName: '重複ID', role: 'REVIEWER', passwordHash: 'x' },
      select: { id: true },
    });
    const res = await agent
      .post('/api/admin/accounts/batch-delete')
      .set('X-CSRF-Token', csrf)
      .send({ accountIds: [acc.id, acc.id] });

    expect(res.status).toBe(200);
    const results = res.body.data.results as Array<{ accountId: string; success: boolean }>;
    expect(results).toHaveLength(1); // deduped, not [success, NOT_FOUND]
    expect(results[0]).toMatchObject({ accountId: acc.id, success: true });
  });

  it('requires CSRF (403)', async () => {
    const { agent } = await adminAgent(app);
    const res = await agent.post('/api/admin/accounts/batch-delete').send({ accountIds: ['x'] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('rejects an unauthenticated request (401)', async () => {
    const { default: request } = await import('supertest');
    const res = await request(app).post('/api/admin/accounts/batch-delete').send({ accountIds: ['x'] });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });
});
