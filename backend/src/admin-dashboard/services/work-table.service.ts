import { catalogService } from '../../catalog/services/catalog.service';
import { AppError } from '../../lib/errors';
import { OVERALL_ID_TO_ZH, PROBLEM_ID_TO_ZH, WARNING_ID_TO_ZH } from '../../reviews/dto/enum-maps';
import { photoReadRepository, type AdminPhotoRow } from '../repositories/photo-read.repository';
import { reviewReadRepository, type SubmittedReview } from '../repositories/review-read.repository';

/**
 * 修圖工作台 — one blueprint, grouped by panel (FR-026/FR-027, research D11).
 *
 * The admin's task is not "read opinions" but "decide how to fix this image", and that decision
 * is made panel by panel — so the evidence (judgement, problem notes, photos) is grouped where
 * it applies rather than listed per reviewer. Panels every submitting reviewer signed off
 * collapse to one line, which is what keeps a 51-image pass tractable.
 *
 * Everything here reads **submitted reviews only**; the repository enforces that at the join.
 */
export interface PhotoRef {
  photoId: string;
  caption: string | null;
  hasAnnotated: boolean;
  urls: { display: string; original: string; annotated: string | null };
}

export interface ReviewerEntry {
  reviewerDisplayName: string;
  isActive: boolean;
  overallJudgement: string | null;
  requiredWarnings: string[];
  warningOther: string | null;
  problemTypes: string[];
  problemNote: string | null;
  photos: PhotoRef[];
  submittedAt: string | null;
}

export interface PanelGroup {
  panelIndex: number;
  stepName: string;
  flaggedReviewerCount: number;
  photoCount: number;
  allClear: boolean;
  entries: ReviewerEntry[];
}

export interface ImageWorkTable {
  blueprintId: string;
  exerciseName: string;
  regionCode: string;
  isHighRisk: boolean;
  submittedReviewerCount: number;
  judgementDistribution: Record<string, number>;
  photoCount: number;
  panels: PanelGroup[];
  imageLevelEntries: ReviewerEntry[];
}

const toPhotoRef = (p: AdminPhotoRow): PhotoRef => {
  const base = `/api/admin/dashboard/photos/${p.id}/file`;
  return {
    photoId: p.id,
    caption: p.caption,
    hasAnnotated: p.annotatedByteSize != null,
    urls: {
      display: `${base}?variant=display`,
      original: `${base}?variant=original`,
      annotated: p.annotatedByteSize != null ? `${base}?variant=annotated` : null,
    },
  };
};

/** A panel entry is worth showing when the reviewer flagged something or attached a photo. */
const hasContent = (e: ReviewerEntry): boolean =>
  e.requiredWarnings.length > 0 ||
  e.problemTypes.length > 0 ||
  Boolean(e.warningOther?.trim()) ||
  Boolean(e.problemNote?.trim()) ||
  e.photos.length > 0;

export const workTableService = {
  async getWorkTable(blueprintCode: string): Promise<ImageWorkTable> {
    const [subs, photos, blueprints] = await Promise.all([
      reviewReadRepository.listSubmittedReviews(),
      photoReadRepository.listForBlueprint(blueprintCode),
      catalogService.listBlueprints({}),
    ]);
    const bp = blueprints.find((b) => b.blueprintId === blueprintCode);
    if (!bp) throw new AppError('BLUEPRINT_NOT_FOUND');
    const detail = await catalogService.getBlueprintDetail(blueprintCode);

    const forImage = subs.filter((s: SubmittedReview) => s.blueprintCode === blueprintCode);
    const photosByReviewer = new Map<string, AdminPhotoRow[]>();
    for (const p of photos) {
      const list = photosByReviewer.get(p.reviewerId) ?? [];
      list.push(p);
      photosByReviewer.set(p.reviewerId, list);
    }

    const judgementDistribution: Record<string, number> = { 通過: 0, 需小修: 0, 需重做: 0 };
    for (const s of forImage) {
      if (s.overallJudgement) judgementDistribution[OVERALL_ID_TO_ZH[s.overallJudgement]] += 1;
    }

    const entryFor = (s: SubmittedReview, panelIndex: number | null): ReviewerEntry => {
      const panel = panelIndex === null ? null : s.panels.find((p) => p.panelIndex === panelIndex);
      const mine = (photosByReviewer.get(s.reviewer.id) ?? []).filter(
        (p) => p.panelIndex === panelIndex,
      );
      return {
        reviewerDisplayName: s.reviewer.displayName,
        isActive: s.reviewer.isActive,
        overallJudgement: s.overallJudgement ? OVERALL_ID_TO_ZH[s.overallJudgement] : null,
        requiredWarnings: (panel?.requiredWarnings ?? []).map((w) => WARNING_ID_TO_ZH[w]),
        warningOther: panel?.warningOther ?? null,
        problemTypes: (panel?.problemTypes ?? []).map((p) => PROBLEM_ID_TO_ZH[p]),
        problemNote: panel?.problemNote ?? null,
        photos: mine.map(toPhotoRef),
        submittedAt: s.submittedAt?.toISOString() ?? null,
      };
    };

    const panels: PanelGroup[] = [1, 2, 3, 4].map((panelIndex) => {
      const entries = forImage.map((s) => entryFor(s, panelIndex));
      const withContent = entries.filter(hasContent);
      const panelPhotoCount = photos.filter((p) => p.panelIndex === panelIndex).length;
      return {
        panelIndex,
        stepName: detail.panels.find((p) => p.panelIndex === panelIndex)?.stepName ?? '',
        flaggedReviewerCount: withContent.length,
        photoCount: panelPhotoCount,
        // "Everyone signed off" is only meaningful when someone actually reviewed it — an image
        // with zero submissions is not all-clear, it is unreviewed.
        allClear: forImage.length > 0 && withContent.length === 0,
        entries: withContent,
      };
    });

    return {
      blueprintId: bp.blueprintId,
      exerciseName: bp.exerciseName,
      regionCode: bp.regionCode,
      isHighRisk: bp.isHighRisk,
      submittedReviewerCount: forImage.length,
      judgementDistribution,
      photoCount: photos.length,
      panels,
      imageLevelEntries: forImage.map((s) => entryFor(s, null)).filter((e) => e.photos.length > 0),
    };
  },
};
