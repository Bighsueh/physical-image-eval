import { z } from 'zod';

/**
 * Boundary validation for the photo routes (constitution V). Multipart text fields arrive as
 * strings, so numeric fields are coerced here rather than trusted. Every schema is an object
 * schema so unknown keys are stripped — a client cannot reach a server-owned column such as
 * `reviewId` or `originalByteSize` by adding a form field.
 */
const CAPTION_MAX = 2000;

/** 說明文字 — optional, length-capped, normalized to null (FR-047). */
export const photoCaptionSchema = z
  .string()
  .max(CAPTION_MAX, '文字過長')
  .nullable()
  .optional()
  .transform((v) => (v == null || v === '' ? null : v));

/** `1..4` binds the photo to a panel; absent/blank means the image-level slot (FR-045/FR-046). */
const panelIndexField = z
  .string()
  .optional()
  .transform((v) => (v == null || v === '' ? null : v))
  .refine((v) => v === null || /^[1-4]$/.test(v), { message: 'panelIndex 必須為 1..4' })
  .transform((v) => (v === null ? null : Number(v)));

export const photoUploadFieldsSchema = z.object({
  panelIndex: panelIndexField,
  caption: photoCaptionSchema,
});

export const photoPatchSchema = z.object({
  caption: photoCaptionSchema,
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const photoVariantSchema = z
  .enum(['display', 'original', 'annotated'])
  .optional()
  .transform((v) => v ?? 'display');

export const photoIdSchema = z.string().min(1).max(64);

export type PhotoUploadFields = z.infer<typeof photoUploadFieldsSchema>;
export type PhotoPatch = z.infer<typeof photoPatchSchema>;
