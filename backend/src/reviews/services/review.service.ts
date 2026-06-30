import { TOTAL_BLUEPRINTS } from '../../catalog/constants/catalog-constants';
import { catalogService } from '../../catalog/services/catalog.service';
import type { BlueprintDetailDto } from '../../catalog/dto/blueprint-public.dto';
import { AppError } from '../../lib/errors';
import { STATUS_ID_TO_ZH } from '../dto/enum-maps';
import { documentToWrite, toReviewPayload } from '../dto/review.dto';
import { reviewRepository, type ReviewWithPanels } from '../repositories/review.repository';
import type { ReviewDocument } from '../validation/review.schema';
import { nextUnreviewed } from './review-ordering';

/**
 * Review workflow service (US1–US5). `reviewerId` is ALWAYS the session account (passed by the
 * controller; never from the request — research D8/SC-010). Autosave preserves status (never
 * elevates/regresses); submit requires 整體判定 and computes the deterministic auto-advance target.
 */

/** The reviewer-facing blueprint shape (002's detail projection minus version/diagnoses). */
const toReviewBlueprint = (d: BlueprintDetailDto) => ({
  blueprintId: d.blueprintId,
  regionCode: d.regionCode,
  regionNameZh: d.regionNameZh,
  exerciseName: d.exerciseName,
  indications: d.indications,
  frequency: d.frequency,
  gentleReminder: d.gentleReminder,
  isHighRisk: d.isHighRisk,
  imageUrl: d.imageUrl,
  panels: d.panels,
});

const saveSummary = (review: ReviewWithPanels) => ({
  status: STATUS_ID_TO_ZH[review.status],
  lastSavedAt: review.lastSavedAt?.toISOString() ?? null,
  submittedAt: review.submittedAt?.toISOString() ?? null,
  lastUpdatedAt: review.lastUpdatedAt.toISOString(),
});

const requireBlueprint = async (code: string): Promise<void> => {
  if (!(await reviewRepository.blueprintExists(code))) throw new AppError('BLUEPRINT_NOT_FOUND');
};

export const reviewService = {
  /** Open a blueprint for review (incl. reopen): read-only blueprint + my review/empty template. */
  async open(reviewerId: string, code: string) {
    const detail = await catalogService.getBlueprintDetail(code); // throws BLUEPRINT_NOT_FOUND if missing
    const review = await reviewRepository.findOwnReviewWithPanels(reviewerId, code);
    const submitted = await reviewRepository.countSubmitted(reviewerId);
    return {
      blueprint: toReviewBlueprint(detail),
      review: toReviewPayload(review),
      progress: { submitted, total: TOTAL_BLUEPRINTS },
    };
  },

  /** Autosave a draft. Status-preserving; never elevates to 已提交 (FR-022..026). */
  async autosave(reviewerId: string, code: string, doc: ReviewDocument) {
    await requireBlueprint(code);
    const review = await reviewRepository.upsertReviewWithPanels({
      reviewerId,
      blueprintCode: code,
      ...documentToWrite(doc),
      intent: 'autosave',
    });
    return saveSummary(review);
  },

  /** Submit (and re-submit). Requires 整體判定; sets 已提交; returns the auto-advance target. */
  async submit(reviewerId: string, code: string, doc: ReviewDocument) {
    await requireBlueprint(code);
    const write = documentToWrite(doc);
    if (write.overallJudgement === null) throw new AppError('OVERALL_JUDGEMENT_REQUIRED');

    const review = await reviewRepository.upsertReviewWithPanels({
      reviewerId,
      blueprintCode: code,
      ...write,
      intent: 'submit',
    });
    const { next, completed, submitted } = await nextUnreviewed(reviewerId);
    return {
      status: STATUS_ID_TO_ZH[review.status],
      submittedAt: review.submittedAt?.toISOString() ?? null,
      lastUpdatedAt: review.lastUpdatedAt.toISOString(),
      next,
      completed,
      progress: { submitted, total: TOTAL_BLUEPRINTS },
    };
  },

  /** "繼續審查" target — the deterministic next unreviewed blueprint (or completion). */
  next(reviewerId: string) {
    return nextUnreviewed(reviewerId);
  },
};
