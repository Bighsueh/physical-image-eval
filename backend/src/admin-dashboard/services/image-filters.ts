import type { ImageProgress } from './progress.service';

/**
 * Pure, combinable (ANDed) image filters (FR-009/010/011). notFullyCovered keeps only blueprints
 * with ≥1 ACTIVE reviewer who has not submitted (i.e. missingReviewers non-empty), so a blueprint
 * with no active reviewers at all is not falsely flagged.
 */
export interface ImageFilters {
  hasRedo?: boolean;
  highRisk?: boolean;
  notFullyCovered?: boolean;
  /** Only blueprints carrying ≥1 photo on a SUBMITTED review (FR-031, 2026-08-27). */
  hasPhotos?: boolean;
}

export const applyImageFilters = (images: ImageProgress[], f: ImageFilters): ImageProgress[] =>
  images.filter(
    (i) =>
      (!f.hasRedo || i.hasRedo) &&
      (!f.highRisk || i.isHighRisk) &&
      (!f.notFullyCovered || i.missingReviewers.length > 0) &&
      (!f.hasPhotos || (i.photoCount ?? 0) > 0),
  );
