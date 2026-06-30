import { Router } from 'express';
import {
  accountDetailHandler,
  batchCreateHandler,
  batchDeleteHandler,
  createAccountHandler,
  disableAccountHandler,
  enableAccountHandler,
  listAccountsHandler,
  resetCredentialHandler,
} from '../controllers/admin-accounts.controller';
import { csrfProtection } from '../middleware/csrf';
import { requireAuth } from '../middleware/require-auth';
import { requirePasswordCurrent } from '../middleware/require-password-current';
import { requireRole } from '../middleware/require-role';

/**
 * Admin account routes under /api/admin/accounts (US2). EVERY route is gated server-side by
 * require-auth → require-role('ADMIN') → require-password-current (FR-011/FR-012). Mutations also
 * require a valid CSRF token (D7). A reviewer hitting any of these gets 403 FORBIDDEN_ROLE.
 */
export const adminAccountsRouter = Router();

adminAccountsRouter.use(requireAuth, requireRole('ADMIN'), requirePasswordCurrent);

adminAccountsRouter.get('/', listAccountsHandler);
adminAccountsRouter.post('/batch', csrfProtection, batchCreateHandler); // literal — before '/:id'
adminAccountsRouter.post('/batch-delete', csrfProtection, batchDeleteHandler);
adminAccountsRouter.get('/:id', accountDetailHandler);
adminAccountsRouter.post('/', csrfProtection, createAccountHandler);
adminAccountsRouter.post('/:id/disable', csrfProtection, disableAccountHandler);
adminAccountsRouter.post('/:id/enable', csrfProtection, enableAccountHandler);
adminAccountsRouter.post('/:id/reset-credential', csrfProtection, resetCredentialHandler);
