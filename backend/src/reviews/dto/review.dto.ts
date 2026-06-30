import type { OverallJudgement, IndicationJudgement } from '@prisma/client';
import type { PanelWrite, ReviewWithPanels } from '../repositories/review.repository';
import type { ReviewDocument } from '../validation/review.schema';
import {
  INDICATION_ID_TO_ZH,
  INDICATION_ZH_TO_ID,
  OVERALL_ID_TO_ZH,
  OVERALL_ZH_TO_ID,
  PROBLEM_ID_TO_ZH,
  PROBLEM_ZH_TO_ID,
  STATUS_ID_TO_ZH,
  WARNING_ID_TO_ZH,
  WARNING_ZH_TO_ID,
} from './enum-maps';

/**
 * Review-payload projection. Prisma enum ids → verbatim zh-TW on output (research D2); free text is
 * stored verbatim (orphan-preserved) but **HTML-escaped on output** (XSS, constitution V). The
 * blueprint payload itself comes from 002's blueprint-public projection (aiPrompt structurally
 * absent) — composed in the service, not here.
 */
export const escapeHtml = (s: string | null): string | null => {
  if (s === null) return null;
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export interface ReviewPanelPayload {
  panelIndex: number;
  requiredWarnings: string[];
  warningOther: string | null;
  problemTypes: string[];
  problemNote: string | null;
}

export interface ReviewPayload {
  status: string;
  overallJudgement: string | null;
  indicationJudgement: string | null;
  indicationNote: string | null;
  panels: ReviewPanelPayload[];
  createdAt: string | null;
  lastSavedAt: string | null;
  submittedAt: string | null;
  lastUpdatedAt: string | null;
}

const emptyPanels = (): ReviewPanelPayload[] =>
  [1, 2, 3, 4].map((panelIndex) => ({
    panelIndex,
    requiredWarnings: [],
    warningOther: null,
    problemTypes: [],
    problemNote: null,
  }));

/** Build the `review` field. null row → empty 未開始 template (renders identically for restore). */
export const toReviewPayload = (review: ReviewWithPanels | null): ReviewPayload => {
  if (!review) {
    return {
      status: '未開始',
      overallJudgement: null,
      indicationJudgement: null,
      indicationNote: null,
      panels: emptyPanels(),
      createdAt: null,
      lastSavedAt: null,
      submittedAt: null,
      lastUpdatedAt: null,
    };
  }
  return {
    status: STATUS_ID_TO_ZH[review.status],
    overallJudgement: review.overallJudgement ? OVERALL_ID_TO_ZH[review.overallJudgement] : null,
    indicationJudgement: review.indicationJudgement
      ? INDICATION_ID_TO_ZH[review.indicationJudgement]
      : null,
    indicationNote: escapeHtml(review.indicationNote),
    panels: [...review.panels]
      .sort((a, b) => a.panelIndex - b.panelIndex)
      .map((p) => ({
        panelIndex: p.panelIndex,
        requiredWarnings: p.requiredWarnings.map((w) => WARNING_ID_TO_ZH[w]),
        warningOther: escapeHtml(p.warningOther),
        problemTypes: p.problemTypes.map((t) => PROBLEM_ID_TO_ZH[t]),
        problemNote: escapeHtml(p.problemNote),
      })),
    createdAt: review.createdAt.toISOString(),
    lastSavedAt: review.lastSavedAt?.toISOString() ?? null,
    submittedAt: review.submittedAt?.toISOString() ?? null,
    lastUpdatedAt: review.lastUpdatedAt.toISOString(),
  };
};

/** Map a validated wire document (zh-TW) → Prisma-typed write fields (stored verbatim, no escaping). */
export const documentToWrite = (
  doc: ReviewDocument,
): {
  overallJudgement: OverallJudgement | null;
  indicationJudgement: IndicationJudgement | null;
  indicationNote: string | null;
  panels: PanelWrite[];
} => ({
  overallJudgement: doc.overallJudgement ? OVERALL_ZH_TO_ID[doc.overallJudgement] : null,
  indicationJudgement: doc.indicationJudgement
    ? INDICATION_ZH_TO_ID[doc.indicationJudgement]
    : null,
  indicationNote: doc.indicationNote,
  panels: doc.panels.map((p) => ({
    panelIndex: p.panelIndex,
    requiredWarnings: p.requiredWarnings.map((w) => WARNING_ZH_TO_ID[w]),
    warningOther: p.warningOther,
    problemTypes: p.problemTypes.map((t) => PROBLEM_ZH_TO_ID[t]),
    problemNote: p.problemNote,
  })),
});
