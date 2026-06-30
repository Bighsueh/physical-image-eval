import { z } from 'zod';

/**
 * Boundary validation primitives (constitution V — validate all input against fixed allowed
 * sets; D11 — username normalized to be case-insensitively unique). zod transforms run at the
 * boundary so the service layer always receives normalized values.
 */

/** Username: trimmed + lower-cased (case-insensitive uniqueness, D11). */
export const usernameSchema = z
  .string({ required_error: '帳號識別碼必填' })
  .trim()
  .min(1, '帳號識別碼必填')
  .max(64, '帳號識別碼過長')
  .transform((s) => s.toLowerCase());

/** Display name: free text, kept with original casing; non-empty. Sanitized on OUTPUT. */
export const displayNameSchema = z
  .string({ required_error: '顯示名稱必填' })
  .trim()
  .min(1, '顯示名稱必填')
  .max(120, '顯示名稱過長');

/** The two and only two roles (FR-001). */
export const roleSchema = z.enum(['ADMIN', 'REVIEWER'], {
  errorMap: () => ({ message: '角色不正確' }),
});

/** A Prisma cuid id (kept permissive but non-empty). */
export const idSchema = z.string().min(1, 'ID 必填');

/** New-password strength policy (used by change-password / reset flows). */
export const passwordPolicySchema = z
  .string({ required_error: '密碼必填' })
  .min(10, '密碼長度至少 10 碼')
  .max(200, '密碼過長');

/** Login/current password — presence only; never reveal policy on the login path. */
export const presentPasswordSchema = z.string({ required_error: '密碼必填' }).min(1, '密碼必填');

/** Login request body — username normalized; password presence only. */
export const loginSchema = z.object({
  username: usernameSchema,
  password: presentPasswordSchema,
});

/** Self password change (forced or voluntary). New password must pass the strength policy. */
export const changePasswordSchema = z.object({
  currentPassword: presentPasswordSchema,
  newPassword: passwordPolicySchema,
});

/** Admin create-account request body. role defaults to REVIEWER. */
export const createAccountSchema = z.object({
  displayName: displayNameSchema,
  username: usernameSchema,
  role: roleSchema.default('REVIEWER'),
});

/** Admin account-list query filters (role / isActive / q). */
export const accountListQuerySchema = z.object({
  role: roleSchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  // Bounded to avoid pathologically large ILIKE patterns (admin-only, but defensive — SEC-L1).
  q: z.string().trim().min(1).max(200).optional(),
});
