import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { adminAgent } from '../helpers/http';

describe('POST /api/admin/accounts (US2)', () => {
  it('creates a reviewer → 201, one-time tempPassword, mustChangePassword, CREATE_ACCOUNT audit', async () => {
    const { agent, csrf } = await adminAgent(app);
    const res = await agent
      .post('/api/admin/accounts')
      .set('X-CSRF-Token', csrf)
      .send({ displayName: '林醫師', username: 'dr.lin', role: 'REVIEWER' });

    expect(res.status).toBe(201);
    expect(res.body.data.account).toMatchObject({
      username: 'dr.lin',
      displayName: '林醫師',
      role: 'REVIEWER',
      isActive: true,
      mustChangePassword: true,
    });
    expect(res.body.data.account.passwordHash).toBeUndefined();
    expect(res.body.data.tempPassword).toMatch(/^\d{6}$/); // 6-digit temp password

    const audit = await prisma.auditLog.findMany({
      where: { targetAccountId: res.body.data.account.id },
    });
    expect(audit.map((a) => a.action)).toContain('CREATE_ACCOUNT');
  });

  it('defaults role to REVIEWER when omitted', async () => {
    const { agent, csrf } = await adminAgent(app);
    const res = await agent
      .post('/api/admin/accounts')
      .set('X-CSRF-Token', csrf)
      .send({ displayName: '王醫師', username: 'dr.wang' });
    expect(res.status).toBe(201);
    expect(res.body.data.account.role).toBe('REVIEWER');
  });

  it('rejects a duplicate username with 409 USERNAME_TAKEN', async () => {
    const { agent, csrf } = await adminAgent(app);
    await agent.post('/api/admin/accounts').set('X-CSRF-Token', csrf).send({ displayName: 'A', username: 'dup' });
    const res = await agent
      .post('/api/admin/accounts')
      .set('X-CSRF-Token', csrf)
      .send({ displayName: 'B', username: 'DUP' }); // case-insensitive collision
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'USERNAME_TAKEN', message: '帳號識別碼已存在' });
  });

  it('rejects an invalid role with 400 VALIDATION_ERROR', async () => {
    const { agent, csrf } = await adminAgent(app);
    const res = await agent
      .post('/api/admin/accounts')
      .set('X-CSRF-Token', csrf)
      .send({ displayName: 'X', username: 'x', role: 'SUPERUSER' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects the mutation without a CSRF token (403 CSRF_INVALID)', async () => {
    const { agent } = await adminAgent(app);
    const res = await agent.post('/api/admin/accounts').send({ displayName: 'X', username: 'nocsrf' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('rejects an unauthenticated request (401 AUTH_REQUIRED)', async () => {
    const res = await request(app).post('/api/admin/accounts').send({ displayName: 'X', username: 'anon' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });
});
