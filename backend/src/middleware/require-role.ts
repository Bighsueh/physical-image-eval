import type { Role } from '@prisma/client';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

/**
 * Server-boundary role gate (FR-011, SC-001). Must run after `require-auth`. A reviewer hitting an
 * admin route ⇒ 403 FORBIDDEN_ROLE regardless of any UI hiding (constitution IV).
 */
export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(new AppError('AUTH_REQUIRED'));
    if (req.auth.account.role !== role) return next(new AppError('FORBIDDEN_ROLE'));
    next();
  };
