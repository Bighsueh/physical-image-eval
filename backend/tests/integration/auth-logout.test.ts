import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { adminAgent } from '../helpers/http';

describe('POST /api/auth/logout (US5, FR-018)', () => {
  it('revokes the current session and clears cookies; later protected requests 401', async () => {
    const { agent, csrf } = await adminAgent(app);

    // sanity: authenticated request works before logout
    expect((await agent.get('/api/admin/accounts')).status).toBe(200);

    const res = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf);
    expect(res.status).toBe(200);
    expect(res.body.data.loggedOut).toBe(true);

    const cleared = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cleared.some((c) => c.startsWith('pie_sid='))).toBe(true); // cookie cleared (expired)

    // subsequent protected request now fails
    expect((await agent.get('/api/admin/accounts')).status).toBe(401);
    expect((await agent.get('/api/auth/session')).status).toBe(401);
  });

  it('rejects logout without a CSRF token (403 CSRF_INVALID)', async () => {
    const { agent } = await adminAgent(app);
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });
});
