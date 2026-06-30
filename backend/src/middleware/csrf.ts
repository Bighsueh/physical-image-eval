import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

/**
 * Double-submit CSRF check on cookie-authenticated mutations (research D7). The SPA echoes the
 * non-httpOnly pie_csrf cookie value in the X-CSRF-Token header; mismatch ⇒ 403 CSRF_INVALID.
 */
const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
};

export const csrfProtection: RequestHandler = (req, _res, next) => {
  const header = req.get('X-CSRF-Token');
  const cookie = req.cookies?.[env.COOKIE_CSRF_NAME];
  if (!header || !cookie || typeof cookie !== 'string' || !safeEqual(header, cookie)) {
    return next(new AppError('CSRF_INVALID'));
  }
  next();
};
