import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { disableAccount, resetCredential } from '../../src/services/account.service';
import { issueSession } from '../../src/services/session.service';
import { makeAdmin, makeReviewer } from '../helpers/factories';

const sessionReq = (token: string) =>
  request(app).get('/api/auth/session').set('Cookie', `pie_sid=${token}`);

describe('multi-device session revocation (US5, FR-017, SC-006)', () => {
  it('disable revokes ALL of the target active sessions instantly', async () => {
    const { account: admin } = await makeAdmin();
    const { account: reviewer } = await makeReviewer();
    const a = await issueSession(reviewer.id);
    const b = await issueSession(reviewer.id);

    // both sessions valid before disable
    expect((await sessionReq(a.token)).status).toBe(200);
    expect((await sessionReq(b.token)).status).toBe(200);

    await disableAccount(admin.id, reviewer.id);

    expect((await sessionReq(a.token)).status).toBe(401);
    expect((await sessionReq(b.token)).status).toBe(401);
  });

  it('reset revokes ALL of the target active sessions instantly', async () => {
    const { account: admin } = await makeAdmin();
    const { account: reviewer } = await makeReviewer();
    const a = await issueSession(reviewer.id);
    const b = await issueSession(reviewer.id);

    await resetCredential(admin.id, reviewer.id);

    expect((await sessionReq(a.token)).status).toBe(401);
    expect((await sessionReq(b.token)).status).toBe(401);
  });
});
