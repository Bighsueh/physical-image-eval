import { z } from 'zod';
import {
  INDICATION_ZH_VALUES,
  OVERALL_ZH_VALUES,
  PROBLEM_ZH_VALUES,
  WARNING_ZH_VALUES,
} from '../dto/enum-maps';

/**
 * Boundary validation for the review API (research D3). Enum values on the wire are the verbatim
 * zh-TW strings; multi-selects are deduped; free text is length-capped; client-sent status/
 * timestamps are stripped (zod objects strip unknown keys). `panels` must be exactly {1,2,3,4}.
 */
export const blueprintIdSchema = z.string().regex(/^[SHETPKLY][1-9][0-9]?$/);

export const regionQuerySchema = z.enum(['S', 'H', 'E', 'T', 'P', 'K', 'L', 'Y']);
export const reviewStatusFilterSchema = z.enum(['未開始', '草稿', '已提交']);

export const progressQuerySchema = z.object({
  region: regionQuerySchema.optional(),
  status: reviewStatusFilterSchema.optional(),
});

const TEXT_MAX = 2000;
const freeText = z
  .string()
  .max(TEXT_MAX, '文字過長')
  .nullable()
  .optional()
  .transform((v) => (v == null ? null : v));

const dedupe = <T>(arr: T[]): T[] => Array.from(new Set(arr));

const panelSchema = z.object({
  panelIndex: z.number().int().min(1).max(4),
  requiredWarnings: z.array(z.enum(WARNING_ZH_VALUES)).default([]).transform(dedupe),
  warningOther: freeText,
  problemTypes: z.array(z.enum(PROBLEM_ZH_VALUES)).default([]).transform(dedupe),
  problemNote: freeText,
});

export const reviewDocumentSchema = z
  .object({
    overallJudgement: z
      .enum(OVERALL_ZH_VALUES)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    indicationJudgement: z
      .enum(INDICATION_ZH_VALUES)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    indicationNote: freeText,
    panels: z
      .array(panelSchema)
      .length(4, 'panels 必須恰為圖1..圖4')
      .refine(
        (panels) => panels.map((p) => p.panelIndex).sort().join(',') === '1,2,3,4',
        { message: 'panels 必須恰為圖1..圖4，且不得重複' },
      ),
  });

export type ReviewDocument = z.infer<typeof reviewDocumentSchema>;
export type ProgressQuery = z.infer<typeof progressQuerySchema>;
