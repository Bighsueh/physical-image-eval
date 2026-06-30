import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { adminAgent, loginAgent } from '../helpers/http';
import { makeAdmin } from '../helpers/factories';

describe('POST /api/auth/password (US2)', () => {
  it('clears mustChangePassword and unblocks protected routes', async () => {
    // A must-change admin is blocked from admin routes until the password is changed.
    const { account, password } = await makeAdmin({ mustChangePassword: true, username: 'newadmin' });
    const { agent, csrf } = await loginAgent(app, account.username, password);

    const blocked = await agent.get('/api/admin/accounts');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const change = await agent
      .post('/api/auth/password')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: password, newPassword: 'A-New-Strong-Pass-9' });
    expect(change.status).toBe(200);
    expect(change.body.data.passwordChanged).toBe(true);

    const allowed = await agent.get('/api/admin/accounts');
    expect(allowed.status).toBe(200); // mustChangePassword cleared
  });

  it('rejects a wrong current password with 401 AUTH_FAILED', async () => {
    const { agent, csrf } = await adminAgent(app);
    const res = await agent
      .post('/api/auth/password')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: 'not-the-password', newPassword: 'A-New-Strong-Pass-9' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_FAILED');
  });

  it('rejects a weak new password with 400 VALIDATION_ERROR', async () => {
    const { agent, csrf, password } = await adminAgent(app);
    const res = await agent
      .post('/api/auth/password')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: password, newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('revokes the caller OTHER sessions but keeps the current one', async () => {
    const { account, password } = await makeAdmin({ username: 'multi.device' });
    const session1 = await loginAgent(app, account.username, password);
    const session2 = await loginAgent(app, account.username, password);

    const change = await session1.agent
      .post('/api/auth/password')
      .set('X-CSRF-Token', session1.csrf)
      .send({ currentPassword: password, newPassword: 'Rotated-Strong-Pass-1' });
    expect(change.status).toBe(200);

    // current session still valid
    expect((await session1.agent.get('/api/admin/accounts')).status).toBe(200);
    // other session revoked
    expect((await session2.agent.get('/api/admin/accounts')).status).toBe(401);
  });
});
