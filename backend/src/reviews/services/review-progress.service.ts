import type { RegionCode, ReviewStatus } from '@prisma/client';
import { catalogService } from '../../catalog/services/catalog.service';
import { reviewRepository } from '../repositories/review.repository';
import type { ProgressQuery } from '../validation/review.schema';

/**
 * Personal progress (US7, FR-039/040/042). Counts always reflect the whole catalog; region/status filter only
 * the returned `index`. 未開始 = no Review row (derived). Scoped to the session reviewer only.
 */
const statusToZh = (s: ReviewStatus | undefined): '未開始' | '草稿' | '已提交' =>
  s === 'SUBMITTED' ? '已提交' : s === 'DRAFT' ? '草稿' : '未開始';

export const reviewProgressService = {
  async getProgress(reviewerId: string, filters: ProgressQuery) {
    const [blueprints, regions, statuses] = await Promise.all([
      catalogService.listBlueprints({}),
      catalogService.listRegions(),
      reviewRepository.ownStatusByBlueprint(reviewerId),
    ]);

    let submitted = 0;
    let draft = 0;
    for (const b of blueprints) {
      const s = statuses.get(b.blueprintId);
      if (s === 'SUBMITTED') submitted += 1;
      else if (s === 'DRAFT') draft += 1;
    }
    const notStarted = blueprints.length - submitted - draft;

    const perRegion = regions.map((r) => {
      const inRegion = blueprints.filter((b) => b.regionCode === (r.regionCode as RegionCode));
      let rs = 0;
      let rd = 0;
      for (const b of inRegion) {
        const s = statuses.get(b.blueprintId);
        if (s === 'SUBMITTED') rs += 1;
        else if (s === 'DRAFT') rd += 1;
      }
      return {
        regionCode: r.regionCode,
        regionNameZh: r.nameZh,
        displayOrder: r.displayOrder,
        total: inRegion.length,
        submitted: rs,
        draft: rd,
        notStarted: inRegion.length - rs - rd,
      };
    });

    let index = blueprints.map((b) => ({
      blueprintId: b.blueprintId,
      regionCode: b.regionCode,
      exerciseName: b.exerciseName,
      isHighRisk: b.isHighRisk,
      myStatus: statusToZh(statuses.get(b.blueprintId)),
    }));
    if (filters.region) index = index.filter((i) => i.regionCode === filters.region);
    if (filters.status) index = index.filter((i) => i.myStatus === filters.status);

    return { submitted, draft, notStarted, total: blueprints.length, perRegion, index };
  },
};
