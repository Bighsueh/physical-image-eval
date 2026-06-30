import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque session tokens, their at-rest hash, per-session CSRF secrets, and human-deliverable
 * one-time temp passwords (research D1, D4, D7). The raw session token lives only in the
 * httpOnly cookie; only its SHA-256 hash is stored.
 */

/** 256-bit opaque session token (base64url). Returned only in the pie_sid cookie. */
export const generateSessionToken = (): string => randomBytes(32).toString('base64url');

/** SHA-256 hex of a token — the value stored in Session.tokenHash and looked up per request. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Per-session CSRF secret mirrored to the pie_csrf cookie (double-submit, D7). */
export const generateCsrfToken = (): string => randomBytes(24).toString('base64url');

// Unambiguous alphabet (no 0/O/1/l/I) for hand-delivered temp passwords (D4).
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Draw `count` characters from TEMP_ALPHABET with rejection sampling (no modulo bias). */
const drawChars = (count: number): string => {
  const max = Math.floor(256 / TEMP_ALPHABET.length) * TEMP_ALPHABET.length; // largest unbiased ceiling
  const out: string[] = [];
  while (out.length < count) {
    const buf = randomBytes(count);
    for (const byte of buf) {
      if (byte < max) {
        out.push(TEMP_ALPHABET[byte % TEMP_ALPHABET.length]);
        if (out.length === count) break;
      }
    }
  }
  return out.join('');
};

/**
 * One-time temp password, e.g. `Hx7K-2pmQ-9rtX` — ≥ 12 chars grouped in fours for legibility
 * (D4). Never stored in plaintext, never logged; only its argon2id hash is persisted.
 */
export const generateTempPassword = (groups = 3): string => {
  const raw = drawChars(groups * 4);
  return (raw.match(/.{1,4}/g) ?? [raw]).join('-');
};
