import type { RequestHandler } from 'express';
import { resolveRedirect, toAuthAccount } from '../lib/account-view';
import { clearAuthCookies, setAuthCookies, setCsrfCookie } from '../lib/cookies';
import { ok } from '../lib/envelope';
import { parseBody } from '../lib/parse';
import { changePasswordSchema, loginSchema } from '../lib/validation';
import { changePassword, login } from '../services/auth.service';
import { revokeSession } from '../services/session.service';

/**
 * Auth controllers. `login` sets the session + CSRF cookies and returns the account + role-based
 * redirect (US1). Session / logout / password-change handlers are added in US2 / US5.
 */
export const loginHandler: RequestHandler = async (req, res, next) => {
  try {
    const { username, password } = parseBody(loginSchema, req.body);
    const { account, issued } = await login(username, password);
    setAuthCookies(res, issued.token, issued.csrfToken);
    res
      .status(200)
      .json(ok({ account: toAuthAccount(account), redirect: resolveRedirect(account) }));
  } catch (err) {
    next(err);
  }
};

/** Change the caller's own password (allowed while mustChangePassword; FR-009). */
export const changePasswordHandler: RequestHandler = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body);
    await changePassword(req.auth!.account.id, req.auth!.session.id, currentPassword, newPassword);
    res.status(200).json(ok({ passwordChanged: true }));
  } catch (err) {
    next(err);
  }
};

/**
 * Restore-on-reopen identity endpoint (FR-016). require-auth has already validated + refreshed the
 * sliding idle marker; here we re-emit the CSRF cookie (D7) and return the caller's own account
 * (including mustChangePassword so the SPA can route the forced-change flow). Invalid/expired/
 * revoked sessions never reach here — require-auth returns 401 first (FR-015/FR-017).
 */
export const sessionHandler: RequestHandler = (req, res, next) => {
  try {
    setCsrfCookie(res, req.auth!.session.csrfToken);
    res.status(200).json(ok({ account: toAuthAccount(req.auth!.account) }));
  } catch (err) {
    next(err);
  }
};

/** End the current session (FR-018): revoke this session row and clear the cookies. */
export const logoutHandler: RequestHandler = async (req, res, next) => {
  try {
    await revokeSession(req.auth!.session.id);
    clearAuthCookies(res);
    res.status(200).json(ok({ loggedOut: true }));
  } catch (err) {
    next(err);
  }
};
