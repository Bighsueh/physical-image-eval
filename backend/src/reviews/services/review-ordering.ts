import { catalogService } from '../../catalog/services/catalog.service';
import { reviewRepository } from '../repositories/review.repository';

/**
 * Auto-advance ordering (research D7, FR-028). The next "unreviewed" blueprint is the first one —
 * in the catalog's deterministic order (Region displayOrder → numeric serial, already applied by
 * 002's listBlueprints) — whose status is NOT 已提交 (i.e. 未開始 or 草稿). null when all are submitted.
 */
export interface NextResult {
  next: string | null;
  completed: boolean;
  submitted: number;
  total: number;
}

export const nextUnreviewed = async (reviewerId: string): Promise<NextResult> => {
  const [ordered, statuses] = await Promise.all([
    catalogService.listBlueprints({}),
    reviewRepository.ownStatusByBlueprint(reviewerId),
  ]);

  let submitted = 0;
  let next: string | null = null;
  for (const b of ordered) {
    const status = statuses.get(b.blueprintId);
    if (status === 'SUBMITTED') submitted += 1;
    else if (next === null) next = b.blueprintId; // first non-submitted in deterministic order
  }

  return { next, completed: next === null, submitted, total: ordered.length };
};
