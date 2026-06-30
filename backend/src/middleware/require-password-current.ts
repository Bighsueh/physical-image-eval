import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

/**
 * While `mustChangePassword` is set, block every protected route except the password-change and
 * logout endpoints (contract; FR-009). Must run after `require-auth`.
 */
export const requirePasswordCurrent: RequestHandler = (req, _res, next) => {
  if (req.auth?.account.mustChangePassword) {
    return next(new AppError('PASSWORD_CHANGE_REQUIRED'));
  }
  next();
};
