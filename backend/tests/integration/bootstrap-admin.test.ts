import { describe, expect, it } from 'vitest';
import { bootstrapAdmin } from '../../src/services/bootstrap.service';
import { makeAdmin } from '../helpers/factories';

describe('bootstrapAdmin (FR-020, D5)', () => {
  it('creates the first ADMIN when none exists (mustChangePassword, createdBy=null)', async () => {
    const result = await bootstrapAdmin('root', 'bootstrap-pass-123');
    expect(result.created).toBe(true);
    expect(result.account?.role).toBe('ADMIN');
    expect(result.account?.isActive).toBe(true);
    expect(result.account?.mustChangePassword).toBe(true);
    expect(result.account?.createdByAccountId).toBeNull();
    expect(result.account?.username).toBe('root');
  });

  it('is a no-op when an admin already exists', async () => {
    await makeAdmin({ username: 'existing.admin' });
    const result = await bootstrapAdmin('root2', 'bootstrap-pass-123');
    expect(result.created).toBe(false);
    expect(result.account).toBeNull();
  });
});
