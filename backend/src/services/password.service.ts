import { Algorithm, hash, verify } from '@node-rs/argon2';
import { env } from '../config/env';

/**
 * Password hashing with argon2id (research D3). Parameters come from env (tuned ≈ 100 ms/verify
 * on deploy hardware). Includes a fixed dummy-hash verify (D6) so the unknown-username login path
 * spends the same time as a real verify — closing the account-enumeration timing side channel
 * (FR-004, SC-004).
 */
const argon2Options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: env.ARGON2_MEMORY_KIB,
  timeCost: env.ARGON2_ITERATIONS,
  parallelism: env.ARGON2_PARALLELISM,
};

export const hashPassword = (plain: string): Promise<string> => hash(plain, argon2Options);

export const verifyPassword = async (hashed: string, plain: string): Promise<boolean> => {
  try {
    return await verify(hashed, plain);
  } catch {
    // Malformed hash etc. → treat as non-match, never throw to the caller.
    return false;
  }
};

// Lazily-computed, cached dummy hash. One argon2 hash on first use; verified against thereafter.
let dummyHashPromise: Promise<string> | null = null;
const getDummyHash = (): Promise<string> => {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword('pie::dummy-password::timing-equalizer');
  }
  return dummyHashPromise;
};

/** Run a real argon2 verify against the dummy hash (unknown user). Always resolves false. */
export const dummyVerify = async (plain: string): Promise<false> => {
  await verifyPassword(await getDummyHash(), plain);
  return false;
};
