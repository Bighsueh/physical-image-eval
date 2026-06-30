import {
  INDICATION_ID_TO_ZH,
  OVERALL_ID_TO_ZH,
  PROBLEM_ID_TO_ZH,
  WARNING_ID_TO_ZH,
} from '../../reviews/dto/enum-maps';
import { encodeSet } from '../csv/multiselect-encode';
import { ACTIVE_LABEL, FLAG_NO, FLAG_YES, INACTIVE_LABEL } from '../constants/dashboard-constants';
import type { SubmittedReview } from '../repositories/review-read.repository';

/** Catalog facts joined by business code for one exported row. */
export interface ExportBlueprintRef {
  exerciseName: string;
  regionCode: string;
  isHighRisk: boolean;
}

const REDO = '需重做';

/**
 * Build one CSV row (the fixed 28-column order — research D4) for a submitted (reviewer × image)
 * record. Free text is emitted RAW here; the csv-serializer does RFC-4180 quoting + formula-
 * injection neutralization at write time (FR-020). Clean panels still emit all 16 panel columns,
 * empty (FR-015). 含需重做 is a per-row flag = (整體判定 === 需重做) (FR-017).
 */
export const buildExportRow = (review: SubmittedReview, bp: ExportBlueprintRef): string[] => {
  const overall = review.overallJudgement ? OVERALL_ID_TO_ZH[review.overallJudgement] : '';
  const panelCells = [1, 2, 3, 4].flatMap((idx) => {
    const p = review.panels.find((pr) => pr.panelIndex === idx);
    if (!p) return ['', '', '', ''];
    return [
      encodeSet(p.requiredWarnings.map((w) => WARNING_ID_TO_ZH[w])),
      p.warningOther ?? '',
      encodeSet(p.problemTypes.map((t) => PROBLEM_ID_TO_ZH[t])),
      p.problemNote ?? '',
    ];
  });

  return [
    review.reviewer.id,
    review.reviewer.displayName,
    review.reviewer.isActive ? ACTIVE_LABEL : INACTIVE_LABEL,
    review.blueprintCode,
    bp.exerciseName,
    bp.regionCode,
    bp.isHighRisk ? FLAG_YES : FLAG_NO,
    overall,
    overall === REDO ? FLAG_YES : FLAG_NO,
    review.indicationJudgement ? INDICATION_ID_TO_ZH[review.indicationJudgement] : '',
    review.indicationNote ?? '',
    ...panelCells,
    review.submittedAt?.toISOString() ?? '',
  ];
};
