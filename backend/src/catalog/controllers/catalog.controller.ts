import type { RequestHandler } from 'express';
import { z } from 'zod';
import { list, ok } from '../../lib/envelope';
import { AppError } from '../../lib/errors';
import { catalogService } from '../services/catalog.service';

/**
 * Catalog controllers. Query/path params are validated against fixed allow-sets (constitution V);
 * any validation failure → 400 INVALID_PARAM. Results are wrapped in the response envelope.
 */
const regionEnum = z.enum(['S', 'H', 'E', 'T', 'P', 'K', 'L', 'Y']);
const blueprintIdRe = /^[SHETPKLY][1-9][0-9]?$/;

const listBlueprintsQuery = z.object({
  region: regionEnum.optional(),
  highRisk: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const diagnosesQuery = z.object({
  mappingKind: z.enum(['MAPPED', 'TEMPLATE', 'REFERRAL']).optional(),
  blueprintId: z.string().regex(blueprintIdRe).optional(),
});

const parseOrInvalid = <S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> => {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError('INVALID_PARAM');
  return r.data;
};

export const listRegionsHandler: RequestHandler = async (_req, res, next) => {
  try {
    const data = await catalogService.listRegions();
    res.status(200).json(list(data, { total: data.length, count: data.length }));
  } catch (err) {
    next(err);
  }
};

export const listBlueprintsHandler: RequestHandler = async (req, res, next) => {
  try {
    const filters = parseOrInvalid(listBlueprintsQuery, req.query);
    const data = await catalogService.listBlueprints(filters);
    res.status(200).json(list(data, { total: data.length, count: data.length }));
  } catch (err) {
    next(err);
  }
};

export const blueprintDetailHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!blueprintIdRe.test(req.params.blueprintId)) throw new AppError('INVALID_PARAM');
    const data = await catalogService.getBlueprintDetail(req.params.blueprintId);
    res.status(200).json(ok(data));
  } catch (err) {
    next(err);
  }
};

export const listDiagnosesHandler: RequestHandler = async (req, res, next) => {
  try {
    const filters = parseOrInvalid(diagnosesQuery, req.query);
    const { data, meta } = await catalogService.listDiagnoses(filters);
    res.status(200).json(list(data, { count: data.length, ...meta }));
  } catch (err) {
    next(err);
  }
};
