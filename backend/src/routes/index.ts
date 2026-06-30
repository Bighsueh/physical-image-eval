import { Router } from 'express';
import { authRouter } from './auth.routes';

/**
 * API router composer. Feature routers are mounted here in their phases:
 *   - auth.routes          → US1 (login) / US2 (password) / US5 (session, logout)
 *   - admin-accounts.routes → US2 (admin account lifecycle)
 * Unknown paths fall through to the 404 envelope (US3).
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
