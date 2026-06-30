import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { login } from '../../src/services/auth.service';
import { makeReviewer } from '../helpers/factories';

describe('auth.service.login (FR-002, D6)', () => {
  it('issues exactly one session for valid credentials', async () => {
    const { account, password } = await makeReviewer({ username: 'dr.lin' });
    const result = await login('dr.lin', password);
    expect(result.account.id).toBe(account.id);
    expect(result.issued.token).toBeTruthy();
    expect(await prisma.session.count({ where: { accountId: account.id } })).toBe(1);
  });

  it('normalizes the username case-insensitively (D11)', async () => {
    const { password } = await makeReviewer({ username: 'dr.lin' });
    const result = await login('DR.LIN', password);
    expect(result.account.username).toBe('dr.lin');
  });

  it('throws generic AUTH_FAILED for an unknown username', async () => {
    await expect(login('ghost', 'whatever')).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('throws generic AUTH_FAILED for a wrong password', async () => {
    await makeReviewer({ username: 'dr.lin', password: 'right-password-1' });
    await expect(login('dr.lin', 'wrong')).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('collapses a disabled account into the same generic AUTH_FAILED', async () => {
    const { password } = await makeReviewer({ username: 'dr.gone', isActive: false });
    await expect(login('dr.gone', password)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('never issues a session on failure', async () => {
    const { account, password } = await makeReviewer({ username: 'dr.gone', isActive: false });
    await login('dr.gone', password).catch(() => undefined);
    expect(await prisma.session.count({ where: { accountId: account.id } })).toBe(0);
  });
});
