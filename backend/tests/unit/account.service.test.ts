import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { verifyPassword } from '../../src/services/password.service';
import {
  createAccount,
  createAccountsBatch,
  deleteAccount,
  deleteAccountsBatch,
  disableAccount,
  enableAccount,
  resetCredential,
} from '../../src/services/account.service';
import { issueSession } from '../../src/services/session.service';
import { makeAdmin, makeReviewer } from '../helpers/factories';

/** Submit one SUBMITTED review for `reviewerId` so delete must be blocked (clinical data). */
const submitReview = (reviewerId: string, blueprintCode: string) =>
  prisma.review.create({
    data: {
      reviewerId,
      blueprintCode,
      status: 'SUBMITTED',
      overallJudgement: 'PASS',
      submittedAt: new Date(),
      panels: {
        create: [1, 2, 3, 4].map((panelIndex) => ({
          panelIndex,
          requiredWarnings: [],
          warningOther: null,
          problemTypes: [],
          problemNote: null,
        })),
      },
    },
  });

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
    expect(tempPassword).not.toBeNull();
    expect(await verifyPassword(account.passwordHash, tempPassword!)).toBe(true);
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

  it('disable/reset audit rows denormalize identity into meta (survive a later deletion)', async () => {
    const { account: admin } = await makeAdmin();
    const { account: reviewer } = await makeReviewer({ displayName: '陳醫師' });
    await disableAccount(admin.id, reviewer.id);
    await resetCredential(admin.id, reviewer.id);

    const disableRow = await prisma.auditLog.findFirst({
      where: { targetAccountId: reviewer.id, action: 'DISABLE_ACCOUNT' },
    });
    const resetRow = await prisma.auditLog.findFirst({
      where: { targetAccountId: reviewer.id, action: 'RESET_CREDENTIAL' },
    });
    expect(disableRow?.meta).toMatchObject({ username: reviewer.username, displayName: '陳醫師' });
    expect(resetRow?.meta).toMatchObject({ username: reviewer.username, displayName: '陳醫師' });
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
    expect(tempPassword).not.toBeNull();
    expect(await verifyPassword(account.passwordHash, tempPassword!)).toBe(true);
    const active = await prisma.session.count({ where: { accountId: reviewer.id, revokedAt: null } });
    expect(active).toBe(0);

    await expect(resetCredential(admin.id, admin.id)).rejects.toMatchObject({
      code: 'SELF_OPERATION_FORBIDDEN',
    });
  });
});

describe('account.service — admin-set password (2026-07-01)', () => {
  it('create with an explicit password: no forced change, no temp password, password verifies', async () => {
    const { account: admin } = await makeAdmin();
    const { account, tempPassword } = await createAccount({
      actorId: admin.id,
      username: 'dr.set',
      displayName: '指定密碼醫師',
      role: 'REVIEWER',
      password: 'clinic2026',
    });
    expect(account.mustChangePassword).toBe(false);
    expect(tempPassword).toBeNull();
    expect(await verifyPassword(account.passwordHash, 'clinic2026')).toBe(true);
    const audit = await prisma.auditLog.findFirst({
      where: { targetAccountId: account.id, action: 'CREATE_ACCOUNT' },
    });
    // Identity is denormalized into meta so the audit row survives a later deletion.
    expect(audit?.meta).toMatchObject({ setByAdmin: true, username: 'dr.set' });
  });
});

describe('account.service — batch create', () => {
  it('creates all valid rows and reports the duplicate as a per-item failure (partial success)', async () => {
    const { account: admin } = await makeAdmin();
    await createAccount({ actorId: admin.id, username: 'dup.one', displayName: '已存在', role: 'REVIEWER' });

    const results = await createAccountsBatch(admin.id, [
      { username: 'batch.a', displayName: '甲', role: 'REVIEWER', password: 'aaaaaa' },
      { username: 'dup.one', displayName: '重複', role: 'REVIEWER' },
      { username: 'batch.b', displayName: '乙', role: 'REVIEWER' },
    ]);

    expect(results.map((r) => r.success)).toEqual([true, false, true]);
    expect(results[0]?.tempPassword).toBeNull(); // admin-set
    expect(results[2]?.tempPassword).toMatch(/^\d{6}$/); // system temp
    expect(results[1]?.error).toContain('已存在');
    expect(await prisma.account.count({ where: { username: { in: ['batch.a', 'batch.b'] } } })).toBe(2);
  });
});

describe('account.service — delete (block-if-submitted; 2026-07-01)', () => {
  it('hard-deletes a reviewer with no submitted reviews, clearing drafts + sessions, keeping the audit row', async () => {
    const { account: admin } = await makeAdmin();
    const { account: reviewer } = await makeReviewer();
    await issueSession(reviewer.id);
    await prisma.review.create({
      data: {
        reviewerId: reviewer.id,
        blueprintCode: 'S3',
        status: 'DRAFT',
        overallJudgement: null,
        panels: {
          create: [1, 2, 3, 4].map((panelIndex) => ({
            panelIndex,
            requiredWarnings: [],
            warningOther: null,
            problemTypes: [],
            problemNote: null,
          })),
        },
      },
    });

    await deleteAccount(admin.id, reviewer.id);

    expect(await prisma.account.findUnique({ where: { id: reviewer.id } })).toBeNull();
    expect(await prisma.review.count({ where: { reviewerId: reviewer.id } })).toBe(0);
    expect(await prisma.session.count({ where: { accountId: reviewer.id } })).toBe(0);
    // The audit row survives (target FK SetNull); identity kept in meta.
    const audit = await prisma.auditLog.findFirst({ where: { action: 'DELETE_ACCOUNT' } });
    expect(audit?.targetAccountId).toBeNull();
    expect(audit?.meta).toMatchObject({ deletedAccountId: reviewer.id });
  });

  it('refuses to delete a reviewer with a submitted review (ACCOUNT_HAS_SUBMITTED_REVIEWS)', async () => {
    const { account: admin } = await makeAdmin();
    const { account: reviewer } = await makeReviewer();
    await submitReview(reviewer.id, 'S1');

    await expect(deleteAccount(admin.id, reviewer.id)).rejects.toMatchObject({
      code: 'ACCOUNT_HAS_SUBMITTED_REVIEWS',
    });
    // Nothing was deleted (rollback).
    expect(await prisma.account.findUnique({ where: { id: reviewer.id } })).not.toBeNull();
    expect(await prisma.review.count({ where: { reviewerId: reviewer.id, status: 'SUBMITTED' } })).toBe(1);
  });

  it('refuses self-delete (SELF_OPERATION_FORBIDDEN)', async () => {
    const { account: admin } = await makeAdmin();
    await expect(deleteAccount(admin.id, admin.id)).rejects.toMatchObject({
      code: 'SELF_OPERATION_FORBIDDEN',
    });
    expect(await prisma.account.findUnique({ where: { id: admin.id } })).not.toBeNull();
  });

  it('refuses to delete the last active admin (LAST_ADMIN_PROTECTED)', async () => {
    const { account: adminA } = await makeAdmin();
    const { account: adminB } = await makeAdmin();
    // Disable adminA → adminB becomes the only ACTIVE admin.
    await disableAccount(adminB.id, adminA.id);
    // Deleting the sole active admin (adminB) is blocked regardless of actor.
    await expect(deleteAccount(adminA.id, adminB.id)).rejects.toMatchObject({
      code: 'LAST_ADMIN_PROTECTED',
    });
    expect(await prisma.account.findUnique({ where: { id: adminB.id } })).not.toBeNull();
  });

  it('batch delete reports per-item success/failure without aborting the rest', async () => {
    const { account: admin } = await makeAdmin();
    const { account: clean } = await makeReviewer();
    const { account: hasSubmitted } = await makeReviewer();
    await submitReview(hasSubmitted.id, 'S2');

    const results = await deleteAccountsBatch(admin.id, [clean.id, hasSubmitted.id]);
    expect(results.find((r) => r.accountId === clean.id)?.success).toBe(true);
    const blocked = results.find((r) => r.accountId === hasSubmitted.id);
    expect(blocked?.success).toBe(false);
    expect(blocked?.error).toContain('停用');
    expect(await prisma.account.findUnique({ where: { id: clean.id } })).toBeNull();
    expect(await prisma.account.findUnique({ where: { id: hasSubmitted.id } })).not.toBeNull();
  });
});
