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
      const ip = req.ip ?? 'unknown';
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
