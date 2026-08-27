import { Router } from 'express';
import { csrfProtection } from '../../middleware/csrf';
import { requireAuth } from '../../middleware/require-auth';
import { requirePasswordCurrent } from '../../middleware/require-password-current';
import { requireRole } from '../../middleware/require-role';
import { reviewPhotoRouter } from '../photos/routes/review-photo.routes';
import {
  autosaveHandler,
  nextHandler,
  openHandler,
  progressHandler,
  resetHandler,
  submitHandler,
} from '../controllers/review.controller';

/**
 * Review API under /api/reviews. EVERY route is require-auth + require-role('REVIEWER') +
 * require-password-current (admins never review — 403 FORBIDDEN_ROLE). Mutations require CSRF.
 * Literal /progress and /next are registered BEFORE /:blueprintId so they don't match the param.
 */
export const reviewRouter = Router();

const guard = [requireAuth, requireRole('REVIEWER'), requirePasswordCurrent];

// Photo routes share the guard chain; mounted before the parameterized review routes so
// `/:blueprintId/photos/...` is not swallowed by `/:blueprintId`.
reviewRouter.use(...guard, reviewPhotoRouter);

reviewRouter.get('/progress', ...guard, progressHandler);
reviewRouter.get('/next', ...guard, nextHandler);
reviewRouter.get('/:blueprintId', ...guard, openHandler);
reviewRouter.patch('/:blueprintId', ...guard, csrfProtection, autosaveHandler);
reviewRouter.post('/:blueprintId/submit', ...guard, csrfProtection, submitHandler);
reviewRouter.post('/:blueprintId/reset', ...guard, csrfProtection, resetHandler);
