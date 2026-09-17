import type { CookieOptions, Response } from 'express';
import { env } from '../config/env';

/**
 * Cookie helpers (contract: Auth & CSRF). pie_sid is httpOnly (no JS access); pie_csrf is readable
 * by the SPA for the double-submit header. Both are Secure (prod) + SameSite=Lax, Domain-bound in
 * prod (COOKIE_DOMAIN). Lifetime tracks the absolute session TTL.
 */
const baseOptions = (): CookieOptions => ({
  secure: env.COOKIE_SECURE,
  sameSite: 'lax',
  path: '/',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const setAuthCookies = (res: Response, sidToken: string, csrfToken: string): void => {
  res.cookie(env.COOKIE_SID_NAME, sidToken, {
    ...baseOptions(),
    httpOnly: true,
    maxAge: env.SESSION_ABSOLUTE_TTL,
  });
  res.cookie(env.COOKIE_CSRF_NAME, csrfToken, {
    ...baseOptions(),
    httpOnly: false,
    maxAge: env.SESSION_ABSOLUTE_TTL,
  });
};

/** Re-emit the CSRF cookie only (GET /session refresh). */
export const setCsrfCookie = (res: Response, csrfToken: string): void => {
  res.cookie(env.COOKIE_CSRF_NAME, csrfToken, {
    ...baseOptions(),
    httpOnly: false,
    maxAge: env.SESSION_ABSOLUTE_TTL,
  });
};

export const clearAuthCookies = (res: Response): void => {
  const opts = baseOptions();
  res.clearCookie(env.COOKIE_SID_NAME, { ...opts, httpOnly: true });
  res.clearCookie(env.COOKIE_CSRF_NAME, { ...opts, httpOnly: false });
};
