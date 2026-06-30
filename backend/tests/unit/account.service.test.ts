import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { verifyPassword } from '../../src/services/password.service';
import {
  createAccount,
  disableAccount,
  enableAccount,
  resetCredential,
} from '../../src/services/account.service';
import { issueSession } from '../../src/services/session.service';
import { makeAdmin, makeReviewer } from '../helpers/factories';

describe('account.service invariants (D10, D11)', () => {
  it('create returns a one-time temp password that hashes to the stored hash; mustChangePassword=true', async () => {
    const { account: admin } = await makeAdmin();
    const { account, tempPassword } = await createAccount({
      actorId: admin.id,
      username: 'dr.chen',
      displayName: '陳醫師',
      role: 'REVIEWER',
    });
    expect(account.mustChangePassword).toBe(true);
    expect(account.createdByAccountId).toBe(admin.id);
    expect(await verifyPassword(account.passwordHash, tempPassword)).toBe(true);
    const audit = await prisma.auditLog.findMany({ where: { targetAccountId: account.id } });
    expect(audit.map((a) => a.action)).toContain('CREATE_ACCOUNT');
  });

  it('create rejects a case-insensitively duplicate username (USERNAME_TAKEN)', async () => {
    const { account: admin } = await makeAdmin();
    await createAccount({ actorId: admin.id, username: 'dr.lin', displayName: '林', role: 'REVIEWER' });
    await expect(
      createAccount({ actorId: admin.id, username: 'DR.LIN', displayName: '另一個林', role: 'REVIEWER' }),
    ).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
  });

  it('disable revokes all sessions and is idempotent; self → SELF_OPERATION_FORBIDDEN', async () => {
    const { account: adminA } = await makeAdmin();
    const { account: adminB } = await makeAdmin();
    const { account: reviewer } = await makeReviewer();
    await issueSession(reviewer.id);
    await issueSession(reviewer.id);

    const disabled = await disableAccount(adminA.id, reviewer.id);
    expect(disabled.isActive).toBe(false);
    const active = await prisma.session.count({ where: { accountId: reviewer.id, revokedAt: null } });
    expect(active).toBe(0);

    // idempotent second disable
    const again = await disableAccount(adminA.id, reviewer.id);
    expect(again.isActive).toBe(false);

    // self disable forbidden (other admin B keeps the system safe)
    await expect(disableAccount(adminB.id, adminB.id)).rejects.toMatchObject({
      code: 'SELF_OPERATION_FORBIDDEN',
    });
  });

  it('refuses to disable the last active admin (LAST_ADMIN_PROTECTED)', async () => {
    const { account: soleAdmin } = await makeAdmin();
    // Any actor disabling the sole active admin would zero-out admins.
    await expect(disableAccount(soleAdmin.id, soleAdmin.id)).rejects.toMatchObject({
      code: 'LAST_ADMIN_PROTECTED',
    });
  });

  it('enable is idempotent and re-activates a disabled account (no new credential)', async () => {
    const { account: admin } = await makeAdmin();
    const { account: reviewer } = await makeReviewer({ isActive: false });
    const enabled = await enableAccount(admin.id, reviewer.id);
    expect(enabled.isActive).toBe(true);
    const hashBefore = enabled.passwordHash;
    const again = await enableAccount(admin.id, reviewer.id);
    expect(again.isActive).toBe(true);
    expect(again.passwordHash).toBe(hashBefore); // enable never rotates credentials
  });

  it('reset rotates the temp password, forces change, revokes sessions, keeps disabled disabled', async () => {
    const { account: admin } = await makeAdmin();
    const { account: reviewer } = await makeReviewer({ isActive: false });
    await issueSession(reviewer.id);

    const { account, tempPassword } = await resetCredential(admin.id, reviewer.id);
    expect(account.mustChangePassword).toBe(true);
    expect(account.isActive).toBe(false); // reset does NOT re-enable
    expect(await verifyPassword(account.passwordHash, tempPassword)).toBe(true);
    const active = await prisma.session.count({ where: { accountId: reviewer.id, revokedAt: null } });
    expect(active).toBe(0);

    await expect(resetCredential(admin.id, admin.id)).rejects.toMatchObject({
      code: 'SELF_OPERATION_FORBIDDEN',
    });
  });
});
