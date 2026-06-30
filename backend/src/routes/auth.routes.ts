import { Router } from 'express';
import {
  changePasswordHandler,
  loginHandler,
  logoutHandler,
  sessionHandler,
} from '../controllers/auth.controller';
import { csrfProtection } from '../middleware/csrf';
import { loginRateLimiter } from '../middleware/rate-limit';
import { requireAuth } from '../middleware/require-auth';

/**
 * Auth routes under /api/auth.
 *  - login    : public, rate-limited, CSRF-exempt (no pre-existing session).
 *  - password : require-auth + CSRF, allowed while mustChangePassword (no password-current gate).
 *  - session  : require-auth — identity/restore endpoint; returns the caller's own account so the
 *               forced-change flow can route (no password-current gate by design).
 *  - logout   : require-auth + CSRF, allowed while mustChangePassword.
 */
export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, loginHandler);
authRouter.post('/password', requireAuth, csrfProtection, changePasswordHandler);
authRouter.get('/session', requireAuth, sessionHandler);
authRouter.post('/logout', requireAuth, csrfProtection, logoutHandler);
