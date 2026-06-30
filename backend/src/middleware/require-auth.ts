import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { validateToken } from '../services/session.service';

/**
 * Resolve the pie_sid cookie → a valid session → account (FR-014..FR-017). Missing / expired /
 * idle-timed-out / revoked ⇒ 401 AUTH_REQUIRED. A disabled account is also rejected (defense in
 * depth — disable revokes sessions, but never serve a disabled account).
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[env.COOKIE_SID_NAME];
    if (!token || typeof token !== 'string') throw new AppError('AUTH_REQUIRED');

    const resolved = await validateToken(token);
    if (!resolved || !resolved.account.isActive) throw new AppError('AUTH_REQUIRED');

    req.auth = { account: resolved.account, session: resolved };
    next();
  } catch (err) {
    next(err);
  }
};
