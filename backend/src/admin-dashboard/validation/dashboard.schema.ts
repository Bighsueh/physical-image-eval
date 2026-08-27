import { z } from 'zod';

/** zod boundary validation for 004 query/path params. Bad value → 400 INVALID_PARAM. */
const boolFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

export const imageFilterSchema = z.object({
  hasRedo: boolFlag,
  highRisk: boolFlag,
  notFullyCovered: boolFlag,
  hasPhotos: boolFlag,
});

export const exportFilterSchema = z.object({
  hasRedo: boolFlag,
  highRisk: boolFlag,
});

export const dashboardBlueprintIdSchema = z.string().regex(/^[SHETPKLY][1-9][0-9]?$/);
