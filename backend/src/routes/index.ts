import { Router } from 'express';

/**
 * API router composer. Feature routers are mounted here in their phases:
 *   - auth.routes          → US1 (login) / US2 (password) / US5 (session, logout)
 *   - admin-accounts.routes → US2 (admin account lifecycle)
 * Until then this is intentionally empty; unknown paths fall through to the 404 envelope (US3).
 */
export const apiRouter = Router();
