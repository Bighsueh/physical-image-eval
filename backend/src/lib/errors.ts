/**
 * Shared error registry (contract: auth-accounts-api.md). `code` is a stable machine string
 * (English); `message` is the user-facing 繁體中文 copy (constitution VIII). HTTP status per
 * the contract table. The login failure copy is a single generic message for unknown / wrong
 * password / disabled account (FR-004, SC-004) — never reveal which factor failed.
 */
export const ERRORS = {
  VALIDATION_ERROR: { status: 400, message: '輸入資料有誤' },
  AUTH_FAILED: { status: 401, message: '帳號或密碼錯誤' },
  AUTH_REQUIRED: { status: 401, message: '請先登入' },
  FORBIDDEN_ROLE: { status: 403, message: '權限不足' },
  CSRF_INVALID: { status: 403, message: '請重新整理後再試' },
  PASSWORD_CHANGE_REQUIRED: { status: 403, message: '首次登入請先變更密碼' },
  ACCOUNT_NOT_FOUND: { status: 404, message: '找不到該帳號' },
  USERNAME_TAKEN: { status: 409, message: '帳號識別碼已存在' },
  SELF_OPERATION_FORBIDDEN: { status: 409, message: '無法對自己的帳號執行此操作' },
  LAST_ADMIN_PROTECTED: { status: 409, message: '系統需保留至少一位啟用的管理員' },
  ACCOUNT_HAS_SUBMITTED_REVIEWS: { status: 409, message: '該帳號已有提交的審查紀錄，請改用「停用」' },
  RATE_LIMITED: { status: 429, message: '嘗試次數過多，請稍後再試' },
  // Catalog / image (feature 002).
  INVALID_PARAM: { status: 400, message: '參數格式不正確' },
  BLUEPRINT_NOT_FOUND: { status: 404, message: '找不到該藍圖' },
  IMAGE_NOT_FOUND: { status: 404, message: '找不到圖檔' },
  // Review workflow (feature 003).
  OVERALL_JUDGEMENT_REQUIRED: { status: 400, message: '請先選擇整體判定' },
  PANEL_REVIEW_INCOMPLETE: { status: 400, message: '每個分格請勾選「無問題」或標注問題' },
  // Reference photos (feature 003 amendment 2026-08-27).
  UNSUPPORTED_IMAGE_TYPE: { status: 400, message: '僅支援 JPG／PNG／WebP 格式的照片' },
  IMAGE_TOO_LARGE: { status: 400, message: '照片檔案過大' },
  // A photo belonging to another reviewer MUST be indistinguishable from a nonexistent one —
  // returning 403 would confirm the id exists (FR-057). Same code serves 004's admin routes,
  // where a photo on a non-submitted review is likewise reported as absent (004 FR-028).
  PHOTO_NOT_FOUND: { status: 404, message: '找不到該照片' },
  // Raised ONLY by the photo upload/annotation routes — review submission must never be
  // blocked by storage pressure (FR-061/SC-020).
  PHOTO_STORAGE_FULL: { status: 409, message: '照片儲存空間已滿，請聯絡管理員' },
  // Infra codes (not in the contract table but used by the 404 / fallthrough handlers).
  NOT_FOUND: { status: 404, message: '找不到資源' },
  INTERNAL_ERROR: { status: 500, message: '伺服器發生錯誤' },
} as const;

export type ErrorCode = keyof typeof ERRORS;

/**
 * Domain/HTTP error. Throwing an AppError anywhere is translated to the response envelope by
 * the central error handler (app.ts). `messageOverride` lets a handler customize the zh-TW copy
 * (e.g. a specific zod validation message) while keeping the stable code + status.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly publicMessage: string;

  constructor(code: ErrorCode, messageOverride?: string) {
    const def = ERRORS[code];
    super(messageOverride ?? def.message);
    this.name = 'AppError';
    this.code = code;
    this.status = def.status;
    this.publicMessage = messageOverride ?? def.message;
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;
