import { Router } from 'express';
import { loginHandler } from '../controllers/auth.controller';
import { loginRateLimiter } from '../middleware/rate-limit';

/**
 * Auth routes under /api/auth. login is public + rate-limited + CSRF-exempt (no pre-existing
 * session). session / logout / password are added in US5 / US2.
 */
export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, loginHandler);
