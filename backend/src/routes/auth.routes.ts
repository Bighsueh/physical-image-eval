import { Router } from 'express';
import { changePasswordHandler, loginHandler } from '../controllers/auth.controller';
import { csrfProtection } from '../middleware/csrf';
import { loginRateLimiter } from '../middleware/rate-limit';
import { requireAuth } from '../middleware/require-auth';

/**
 * Auth routes under /api/auth. login is public + rate-limited + CSRF-exempt (no pre-existing
 * session). password requires auth + CSRF but is allowed while mustChangePassword (NO
 * require-password-current). session / logout are added in US5.
 */
export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, loginHandler);
authRouter.post('/password', requireAuth, csrfProtection, changePasswordHandler);
