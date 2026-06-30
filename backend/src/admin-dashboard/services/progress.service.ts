import { catalogService } from '../../catalog/services/catalog.service';
import { AppError } from '../../lib/errors';
import { INDICATION_ID_TO_ZH, OVERALL_ID_TO_ZH } from '../../reviews/dto/enum-maps';
import { HIGH_RISK_BLUEPRINT_IDS, TOTAL_BLUEPRINTS } from '../constants/dashboard-constants';
import {
  reviewReadRepository,
  type ReviewerAccount,
  type SubmittedReview,
} from '../repositories/review-read.repository';
import { completionPercent } from './completion-ratio';
import { applyImageFilters, type ImageFilters } from './image-filters';

/**
 * Pure derived projections (FR-002..008/016/022). Active basis throughout; 非在職 submissions are
 * surfaced separately and never enter an active numerator. Free text (displayName) is returned
 * verbatim — the React dashboard renders it safely; the CSV export neutralizes injection at its own
 * boundary. All builders are pure + immutable; the service just fetches and composes.
 */
export interface BlueprintRef {
  blueprintId: string;
  exerciseName: string;
  regionCode: string;
  isHighRisk: boolean;
}
export type Distribution = { 通過: number; 需小修: number; 需重做: number };
export interface ImageProgress {
  blueprintId: string;
  exerciseName: string;
  regionCode: string;
  isHighRisk: boolean;
  submittedActiveCount: number;
  missingReviewers: { accountId: string; displayName: string }[];
  fullCoverage: boolean;
  distribution: Distribution;
  hasRedo: boolean;
  inactiveSubmittedCount: number;
}

const subsFor = (subs: SubmittedReview[], code: string) => subs.filter((s) => s.blueprintCode === code);

export const buildImageProgress = (
  reviewers: ReviewerAccount[],
  subs: SubmittedReview[],
  blueprints: BlueprintRef[],
): ImageProgress[] => {
  const activeReviewers = reviewers.filter((r) => r.isActive);
  return blueprints.map((b) => {
    const all = subsFor(subs, b.blueprintId);
    const active = all.filter((s) => s.reviewer.isActive);
    const distribution: Distribution = { 通過: 0, 需小修: 0, 需重做: 0 };
    for (const s of active) if (s.overallJudgement) distribution[OVERALL_ID_TO_ZH[s.overallJudgement] as keyof Distribution] += 1;
    const submittedIds = new Set(active.map((s) => s.reviewer.id));
    const missingReviewers = activeReviewers
      .filter((r) => !submittedIds.has(r.id))
      .map((r) => ({ accountId: r.id, displayName: r.displayName }));
    return {
      blueprintId: b.blueprintId,
      exerciseName: b.exerciseName,
      regionCode: b.regionCode,
      isHighRisk: b.isHighRisk,
      submittedActiveCount: active.length,
      missingReviewers,
      fullCoverage: missingReviewers.length === 0 && activeReviewers.length > 0,
      distribution,
      hasRedo: distribution.需重做 > 0,
      inactiveSubmittedCount: all.length - active.length,
    };
  });
};

export const buildOverview = (reviewers: ReviewerAccount[], subs: SubmittedReview[], images: ImageProgress[]) => {
  const activeReviewerCount = reviewers.filter((r) => r.isActive).length;
  const submittedActive = subs.filter((s) => s.reviewer.isActive).length;
  const expectedSubmissions = activeReviewerCount * TOTAL_BLUEPRINTS;
  return {
    activeReviewerCount,
    expectedSubmissions,
    submittedActive,
    percent: completionPercent(submittedActive, expectedSubmissions),
    inactiveSubmittedTotal: subs.length - submittedActive,
    fullyCoveredCount: images.filter((i) => i.fullCoverage).length,
    blueprintsWithRedoCount: images.filter((i) => i.hasRedo).length,
    highRiskCount: HIGH_RISK_BLUEPRINT_IDS.size,
    totalBlueprints: TOTAL_BLUEPRINTS,
  };
};

export const buildReviewerProgress = (
  reviewers: ReviewerAccount[],
  subs: SubmittedReview[],
  blueprints: BlueprintRef[],
) => {
  const allCodes = blueprints.map((b) => b.blueprintId);
  const rows = reviewers.map((r) => {
    const mine = subs.filter((s) => s.reviewer.id === r.id);
    const submittedCodes = new Set(mine.map((s) => s.blueprintCode));
    const ts = (s: SubmittedReview | null) => s?.submittedAt?.getTime() ?? 0;
    const last = mine.reduce<SubmittedReview | null>((acc, s) => (ts(s) > ts(acc) ? s : acc), null);
    return {
      accountId: r.id,
      displayName: r.displayName,
      isActive: r.isActive,
      submittedCount: mine.length,
      total: TOTAL_BLUEPRINTS,
      unreviewedBlueprintIds: allCodes.filter((c) => !submittedCodes.has(c)),
      lastSubmittedBlueprintId: last?.blueprintCode ?? null,
      lastSubmittedAt: last?.submittedAt?.toISOString() ?? null,
    };
  });
  // active first, then 非在職; each group already displayName-ordered by the repository
  return [...rows.filter((r) => r.isActive), ...rows.filter((r) => !r.isActive)];
};

export const buildDrillDown = (image: ImageProgress, subs: SubmittedReview[]) => {
  const all = subsFor(subs, image.blueprintId);
  const rows = [...all.filter((s) => s.reviewer.isActive), ...all.filter((s) => !s.reviewer.isActive)].map((s) => ({
    accountId: s.reviewer.id,
    displayName: s.reviewer.displayName,
    isActive: s.reviewer.isActive,
    overallJudgement: s.overallJudgement ? OVERALL_ID_TO_ZH[s.overallJudgement] : null,
    indicationJudgement: s.indicationJudgement ? INDICATION_ID_TO_ZH[s.indicationJudgement] : null,
    submittedAt: s.submittedAt?.toISOString() ?? null,
  }));
  const distinct = new Set(rows.map((r) => r.overallJudgement).filter((v): v is string => v !== null));
  return { blueprintId: image.blueprintId, summary: image, rows, hasDisagreement: distinct.size > 1 };
};

const toRef = (b: { blueprintId: string; exerciseName: string; regionCode: string; isHighRisk: boolean }): BlueprintRef => ({
  blueprintId: b.blueprintId,
  exerciseName: b.exerciseName,
  regionCode: b.regionCode,
  isHighRisk: b.isHighRisk,
});

export const progressService = {
  async getOverview() {
    const [reviewers, subs, blueprints] = await Promise.all([
      reviewReadRepository.listReviewerAccounts(),
      reviewReadRepository.listSubmittedReviews(),
      catalogService.listBlueprints({}),
    ]);
    const images = buildImageProgress(reviewers, subs, blueprints.map(toRef));
    return buildOverview(reviewers, subs, images);
  },

  async getReviewers() {
    const [reviewers, subs, blueprints] = await Promise.all([
      reviewReadRepository.listReviewerAccounts(),
      reviewReadRepository.listSubmittedReviews(),
      catalogService.listBlueprints({}),
    ]);
    const rows = buildReviewerProgress(reviewers, subs, blueprints.map(toRef));
    return {
      rows,
      activeCount: rows.filter((r) => r.isActive).length,
      inactiveCount: rows.filter((r) => !r.isActive).length,
    };
  },

  async getImages(filters: ImageFilters) {
    const [reviewers, subs, blueprints] = await Promise.all([
      reviewReadRepository.listReviewerAccounts(),
      reviewReadRepository.listSubmittedReviews(),
      catalogService.listBlueprints({}),
    ]);
    const all = buildImageProgress(reviewers, subs, blueprints.map(toRef));
    return { all, filtered: applyImageFilters(all, filters) };
  },

  async getDrillDown(blueprintCode: string) {
    const [reviewers, subs, blueprints] = await Promise.all([
      reviewReadRepository.listReviewerAccounts(),
      reviewReadRepository.listSubmittedReviews(),
      catalogService.listBlueprints({}),
    ]);
    const ref = blueprints.map(toRef).find((b) => b.blueprintId === blueprintCode);
    if (!ref) throw new AppError('BLUEPRINT_NOT_FOUND');
    const image = buildImageProgress(reviewers, subs, [ref])[0];
    return buildDrillDown(image, subs);
  },
};
