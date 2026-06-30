import type { RequestHandler } from 'express';
import { ok } from '../../lib/envelope';
import { AppError } from '../../lib/errors';
import { progressService } from '../services/progress.service';
import { dashboardBlueprintIdSchema, imageFilterSchema } from '../validation/dashboard.schema';

/** Admin dashboard read endpoints (FR-002..008). All ADMIN-only + GET-only (enforced by the routes). */

export const overviewHandler: RequestHandler = async (_req, res, next) => {
  try {
    res.status(200).json(ok(await progressService.getOverview()));
  } catch (err) {
    next(err);
  }
};

export const reviewersHandler: RequestHandler = async (_req, res, next) => {
  try {
    const { rows, activeCount, inactiveCount } = await progressService.getReviewers();
    res.status(200).json(ok(rows, { total: rows.length, activeCount, inactiveCount }));
  } catch (err) {
    next(err);
  }
};

export const imagesHandler: RequestHandler = async (req, res, next) => {
  try {
    const q = imageFilterSchema.safeParse(req.query);
    if (!q.success) throw new AppError('INVALID_PARAM');
    const { all, filtered } = await progressService.getImages(q.data);
    res.status(200).json(ok(filtered, { total: all.length, returned: filtered.length }));
  } catch (err) {
    next(err);
  }
};

export const drilldownHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsed = dashboardBlueprintIdSchema.safeParse(req.params.blueprintId);
    if (!parsed.success) throw new AppError('INVALID_PARAM');
    res.status(200).json(ok(await progressService.getDrillDown(parsed.data)));
  } catch (err) {
    next(err);
  }
};
