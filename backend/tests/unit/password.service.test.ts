import { describe, expect, it } from 'vitest';
import {
  dummyVerify,
  hashPassword,
  verifyPassword,
} from '../../src/services/password.service';

describe('password.service (argon2id, D3/D6)', () => {
  it('hashes then verifies a correct password', async () => {
    const hash = await hashPassword('S0me-Strong-Pass!');
    expect(hash).toMatch(/^\$argon2id\$/); // argon2id encoded hash
    expect(hash).not.toContain('S0me-Strong-Pass!'); // never the plaintext
    expect(await verifyPassword(hash, 'S0me-Strong-Pass!')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('produces distinct hashes for the same input (random salt)', async () => {
    const a = await hashPassword('same-input-123');
    const b = await hashPassword('same-input-123');
    expect(a).not.toEqual(b);
    expect(await verifyPassword(a, 'same-input-123')).toBe(true);
  });

  it('dummyVerify always returns false and runs a real argon2 verify (constant cost, D6)', async () => {
    // Used on the unknown-username path so timing matches the real verify (FR-004/SC-004).
    expect(await dummyVerify('anything')).toBe(false);
    expect(await dummyVerify('')).toBe(false);
  });
});
