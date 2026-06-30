import { createHash } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { fail } from '../lib/envelope';
import { ERRORS } from '../lib/errors';

/**
 * Login rate limit keyed by client IP + submitted username (hashed), so targeted guessing is
 * throttled without locking a whole IP for the team (research D8, FR-021). Exceeding it returns
 * 429 RATE_LIMITED with the SAME generic copy — no account-existence signal (SC-004).
 */
export const makeLoginRateLimiter = (max: number, windowMs: number): RequestHandler =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Prefer Cloudflare's real-client header (prod is behind Cloudflared → nginx); fall back to
      // req.ip (trust-proxy aware). Avoids keying every client to the tunnel egress IP (SEC-M2).
      const cf = req.headers['cf-connecting-ip'];
      const ip = (typeof cf === 'string' && cf) || req.ip || 'unknown';
      const username =
        typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : '';
      return createHash('sha256').update(`${ip}|${username}`).digest('hex');
    },
    handler: (_req, res) => {
      res
        .status(ERRORS.RATE_LIMITED.status)
        .json(fail('RATE_LIMITED', ERRORS.RATE_LIMITED.message));
    },
  });

export const loginRateLimiter = makeLoginRateLimiter(env.LOGIN_RATE_MAX, env.LOGIN_RATE_WINDOW);

/**
 * Per-IP throttle for the ADMIN read/export routes (004). Defense-in-depth: a compromised admin
 * session can otherwise bulk-exfiltrate the whole review corpus (the CSV export runs two full
 * findMany scans per call) at unlimited speed before the session is revoked. Generous enough for
 * real dashboard use, but caps abusive scraping.
 */
export const adminReadRateLimiter: RequestHandler = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const cf = req.headers['cf-connecting-ip'];
    return (typeof cf === 'string' && cf) || req.ip || 'unknown';
  },
  handler: (_req, res) => {
    res.status(ERRORS.RATE_LIMITED.status).json(fail('RATE_LIMITED', ERRORS.RATE_LIMITED.message));
  },
});
