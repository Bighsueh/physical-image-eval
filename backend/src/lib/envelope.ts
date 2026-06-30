/**
 * Project response envelope (contract: auth-accounts-api.md):
 *   success: { success: true,  data: T,    error: null, meta? }
 *   failure: { success: false, data: null, error: { code, message } }
 * `meta` appears only on list endpoints ({ total, count, ... }).
 */
export interface ErrorBody {
  code: string;
  message: string;
}

export interface ListMeta {
  total: number;
  count: number;
  [key: string]: unknown;
}

export interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: ErrorBody | null;
  meta?: Record<string, unknown>;
}

export const ok = <T>(data: T, meta?: Record<string, unknown>): Envelope<T> => ({
  success: true,
  data,
  error: null,
  ...(meta ? { meta } : {}),
});

export const fail = (code: string, message: string): Envelope<null> => ({
  success: false,
  data: null,
  error: { code, message },
});

export const list = <T>(data: T[], meta: ListMeta): Envelope<T[]> => ({
  success: true,
  data,
  error: null,
  meta,
});
