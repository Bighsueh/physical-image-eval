import { createHash, randomBytes, randomInt } from 'node:crypto';

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

/**
 * One-time temp password — a random **6-digit number** (0–9, e.g. `428301`), per the 2026-06-30
 * clarification. `crypto.randomInt` is unbiased; padded to keep leading zeros. Never stored in
 * plaintext, never logged; only its argon2id hash is persisted. Matches the 6-digit password policy.
 */
export const generateTempPassword = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');
