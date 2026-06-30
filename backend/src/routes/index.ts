import { Router } from 'express';
import {
  adminDashboardRouter,
  adminExportRouter,
} from '../admin-dashboard/routes/admin-dashboard.routes';
import { catalogRouter } from '../catalog/routes/catalog.routes';
import { imageRouter } from '../images/routes/image.routes';
import { reviewRouter } from '../reviews/routes/review.routes';
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
apiRouter.use('/admin/dashboard', adminDashboardRouter); // 004 (ADMIN-only, GET-only)
apiRouter.use('/admin/export', adminExportRouter); // 004 (ADMIN-only CSV)
apiRouter.use('/', catalogRouter);
apiRouter.use('/', imageRouter);
apiRouter.use('/reviews', reviewRouter);
