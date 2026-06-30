import { Router } from 'express';
import { catalogRouter } from '../catalog/routes/catalog.routes';
import { imageRouter } from '../images/routes/image.routes';
import { adminAccountsRouter } from './admin-accounts.routes';
import { authRouter } from './auth.routes';

/**
 * API router composer.
 *   - auth.routes          → 001 (login / password / session / logout)
 *   - admin-accounts.routes → 001 (admin account lifecycle)
 *   - catalog.routes        → 002 (GET-only catalog read API)
 *   - image.routes          → 002 (read-only blueprint image)
 * Unknown paths fall through to the 404 envelope.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin/accounts', adminAccountsRouter);
apiRouter.use('/', catalogRouter);
apiRouter.use('/', imageRouter);
