import { type ZodTypeAny, type infer as zInfer } from 'zod';
import { AppError } from './errors';

/**
 * Parse a request body against a zod schema at the boundary (constitution V). On failure throws a
 * generic `VALIDATION_ERROR` (輸入資料有誤). Generic over the schema so defaulted fields keep their
 * non-undefined OUTPUT type (e.g. role default → 'REVIEWER').
 */
export const parseBody = <S extends ZodTypeAny>(schema: S, body: unknown): zInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError('VALIDATION_ERROR');
  return result.data;
};
