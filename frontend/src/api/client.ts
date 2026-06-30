import { readCsrfToken } from '../lib/csrf';

/**
 * Fetch wrapper for the project envelope. Sends cookies (`credentials: 'include'`), attaches the
 * CSRF header on mutations (D7), parses the envelope, and throws `ApiError` (with stable `code`)
 * on any non-success so callers/UI can branch on the code while showing the zh-TW message.
 */
export interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  meta?: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const isMutation = (method: Method): boolean => method !== 'GET';

export interface ApiResult<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export async function apiFetch<T>(
  path: string,
  options: { method?: Method; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (isMutation(method)) {
    const csrf = readCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const envelope = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (!res.ok || !envelope || !envelope.success) {
    throw new ApiError(
      envelope?.error?.code ?? 'UNKNOWN',
      envelope?.error?.message ?? '發生未知錯誤',
      res.status,
    );
  }

  // A successful envelope must carry data — guard the cast so a null never reaches callers as T.
  if (envelope.data === null || envelope.data === undefined) {
    throw new ApiError('UNEXPECTED_NULL', '回應資料異常', res.status);
  }

  return { data: envelope.data, meta: envelope.meta };
}
