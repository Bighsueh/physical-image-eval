import type { RequestHandler } from 'express';
import { ok } from '../../lib/envelope';
import { AppError } from '../../lib/errors';
import { parseBody } from '../../lib/parse';
import {
  blueprintIdSchema,
  progressQuerySchema,
  reviewDocumentSchema,
} from '../validation/review.schema';
import { reviewProgressService } from '../services/review-progress.service';
import { reviewService } from '../services/review.service';

/**
 * Review controllers (US1–US7). `reviewerId` is ALWAYS `req.auth.account.id` (the session reviewer)
 * — never from path/query/body (SC-010). `:blueprintId` is validated against the catalog regex
 * (INVALID_PARAM); bodies against the ReviewDocument schema (VALIDATION_ERROR).
 */
const reviewerId = (req: Parameters<RequestHandler>[0]): string => req.auth!.account.id;

const requireBlueprintId = (raw: string): string => {
  const r = blueprintIdSchema.safeParse(raw);
  if (!r.success) throw new AppError('INVALID_PARAM');
  return r.data;
};

export const progressHandler: RequestHandler = async (req, res, next) => {
  try {
    const q = progressQuerySchema.safeParse(req.query);
    if (!q.success) throw new AppError('INVALID_PARAM');
    const data = await reviewProgressService.getProgress(reviewerId(req), q.data);
    // data = full progress object (counts + perRegion + filtered index); meta mirrors the headline.
    res.status(200).json(
      ok(data, {
        total: data.total,
        submitted: data.submitted,
        draft: data.draft,
        notStarted: data.notStarted,
      }),
    );
  } catch (err) {
    next(err);
  }
};

export const nextHandler: RequestHandler = async (req, res, next) => {
  try {
    const data = await reviewService.next(reviewerId(req));
    res.status(200).json(ok(data));
  } catch (err) {
    next(err);
  }
};

export const openHandler: RequestHandler = async (req, res, next) => {
  try {
    const code = requireBlueprintId(req.params.blueprintId);
    const data = await reviewService.open(reviewerId(req), code);
    res.status(200).json(ok(data));
  } catch (err) {
    next(err);
  }
};

export const autosaveHandler: RequestHandler = async (req, res, next) => {
  try {
    const code = requireBlueprintId(req.params.blueprintId);
    const doc = parseBody(reviewDocumentSchema, req.body);
    const data = await reviewService.autosave(reviewerId(req), code, doc);
    res.status(200).json(ok(data));
  } catch (err) {
    next(err);
  }
};

export const submitHandler: RequestHandler = async (req, res, next) => {
  try {
    const code = requireBlueprintId(req.params.blueprintId);
    const doc = parseBody(reviewDocumentSchema, req.body);
    const data = await reviewService.submit(reviewerId(req), code, doc);
    res.status(200).json(ok(data));
  } catch (err) {
    next(err);
  }
};

export const resetHandler: RequestHandler = async (req, res, next) => {
  try {
    const code = requireBlueprintId(req.params.blueprintId);
    const data = await reviewService.reset(reviewerId(req), code);
    res.status(200).json(ok(data));
  } catch (err) {
    next(err);
  }
};
