import { Router } from 'express';
import {
  blueprintDetailHandler,
  listBlueprintsHandler,
  listDiagnosesHandler,
  listRegionsHandler,
} from '../controllers/catalog.controller';
import { requireAuth } from '../../middleware/require-auth';
import { requirePasswordCurrent } from '../../middleware/require-password-current';

/**
 * GET-only catalog read API (constitution XI — no write routes). Any authenticated role may read
 * (contract §Auth); must-change users are blocked until they set a password. Guards are applied
 * PER ROUTE (not router-wide) so unmatched paths fall through to the 404 handler, not 401.
 */
export const catalogRouter = Router();

const guards = [requireAuth, requirePasswordCurrent];

catalogRouter.get('/regions', ...guards, listRegionsHandler);
catalogRouter.get('/blueprints', ...guards, listBlueprintsHandler);
catalogRouter.get('/blueprints/:blueprintId', ...guards, blueprintDetailHandler);
catalogRouter.get('/diagnoses', ...guards, listDiagnosesHandler);
