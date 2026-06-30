import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { recordAction } from '../../src/services/audit.service';
import { makeAdmin, makeReviewer } from '../helpers/factories';

describe('audit.service (FR-023, D9)', () => {
  it('appends an audit row inside the caller transaction', async () => {
    const { account: admin } = await makeAdmin();
    const { account: target } = await makeReviewer();

    await prisma.$transaction(async (tx) => {
      await recordAction(
        { actorAccountId: admin.id, targetAccountId: target.id, action: 'CREATE_ACCOUNT', meta: { role: 'REVIEWER' } },
        tx,
      );
    });

    const rows = await prisma.auditLog.findMany({ where: { targetAccountId: target.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('CREATE_ACCOUNT');
    expect(rows[0].actorAccountId).toBe(admin.id);
  });

  it('rolls back the audit row when the surrounding transaction fails (atomicity)', async () => {
    const { account: admin } = await makeAdmin();
    const { account: target } = await makeReviewer();

    await expect(
      prisma.$transaction(async (tx) => {
        await recordAction(
          { actorAccountId: admin.id, targetAccountId: target.id, action: 'DISABLE_ACCOUNT' },
          tx,
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const rows = await prisma.auditLog.findMany({ where: { targetAccountId: target.id } });
    expect(rows).toHaveLength(0);
  });

  it('rejects meta containing sensitive fields (no passwords/tokens/hashes)', async () => {
    const { account: admin } = await makeAdmin();
    const { account: target } = await makeReviewer();

    await expect(
      recordAction({
        actorAccountId: admin.id,
        targetAccountId: target.id,
        action: 'RESET_CREDENTIAL',
        meta: { tempPassword: 'secret' },
      }),
    ).rejects.toThrow();
  });
});
