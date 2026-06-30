import type { ZodSchema } from 'zod';
import { AppError } from './errors';

/**
 * Parse a request body against a zod schema at the boundary (constitution V). On failure throws a
 * generic `VALIDATION_ERROR` (輸入資料有誤) — we never echo raw input back, and the generic copy
 * matches the contract table.
 */
export const parseBody = <T>(schema: ZodSchema<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError('VALIDATION_ERROR');
  return result.data;
};
