import type { RequestHandler } from 'express';
import { resolveRedirect, toAuthAccount } from '../lib/account-view';
import { setAuthCookies } from '../lib/cookies';
import { ok } from '../lib/envelope';
import { parseBody } from '../lib/parse';
import { changePasswordSchema, loginSchema } from '../lib/validation';
import { changePassword, login } from '../services/auth.service';

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
