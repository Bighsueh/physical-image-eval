import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth';
import { requirePasswordCurrent } from '../../middleware/require-password-current';
import { requireRole } from '../../middleware/require-role';
import {
  drilldownHandler,
  imagesHandler,
  overviewHandler,
  reviewersHandler,
} from '../controllers/admin-dashboard.controller';
import { exportCsvHandler } from '../controllers/admin-export.controller';

/**
 * Admin dashboard + export routers. EVERY route is require-auth + require-role('ADMIN') +
 * require-password-current, and GET-only — 004 mutates nothing (constitution XI, FR-012/SC-007).
 * No CSRF (no state-changing request exists). Reviewers/anon → 403/401.
 */
const guard = [requireAuth, requireRole('ADMIN'), requirePasswordCurrent];

export const adminDashboardRouter = Router();
adminDashboardRouter.get('/overview', ...guard, overviewHandler);
adminDashboardRouter.get('/reviewers', ...guard, reviewersHandler);
adminDashboardRouter.get('/images', ...guard, imagesHandler);
adminDashboardRouter.get('/images/:blueprintId', ...guard, drilldownHandler);

export const adminExportRouter = Router();
adminExportRouter.get('/reviews.csv', ...guard, exportCsvHandler);
