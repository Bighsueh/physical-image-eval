import { catalogService } from '../../catalog/services/catalog.service';
import { HIGH_RISK_BLUEPRINT_IDS } from '../constants/dashboard-constants';
import { buildExportRow, type ExportBlueprintRef } from '../dto/export-record.dto';
import { photoColumnsFor } from '../csv/export-photo-columns';
import { photoReadRepository, type AdminPhotoRow } from '../repositories/photo-read.repository';
import { reviewReadRepository, type SubmittedReview } from '../repositories/review-read.repository';

/**
 * Build the export row set (FR-013..017). Submitted-only (drafts never fetched), includes active +
 * 非在職 (each flagged in the row), exactly one row per (reviewer × blueprint) — guaranteed by the
 * 003 unique key. Optional hasRedo/highRisk filters narrow rows but never change column structure.
 * Ordered by catalog blueprint order then reviewer displayName for deterministic output.
 */
export interface ExportFilters {
  hasRedo?: boolean;
  highRisk?: boolean;
}

export const exportService = {
  async buildRows(filters: ExportFilters): Promise<string[][]> {
    const [subs, blueprints] = await Promise.all([
      reviewReadRepository.listSubmittedReviews(),
      catalogService.listBlueprints({}),
    ]);

    // Photos for every blueprint that appears in the export, fetched once. The repository joins
    // through submitted reviews only, so a draft's photos can never leak into a row (FR-028).
    const photosByBlueprint = new Map<string, AdminPhotoRow[]>();
    for (const code of new Set(subs.map((s) => s.blueprintCode))) {
      photosByBlueprint.set(code, await photoReadRepository.listForBlueprint(code));
    }

    const refByCode = new Map<string, ExportBlueprintRef>(
      blueprints.map((b) => [b.blueprintId, { exerciseName: b.exerciseName, regionCode: b.regionCode, isHighRisk: b.isHighRisk }]),
    );
    const order = new Map(blueprints.map((b, i) => [b.blueprintId, i]));

    // Blueprints with ≥1 ACTIVE 需重做 — matches the dashboard's active-basis hasRedo (FR-010); an
    // inactive reviewer's REDO must NOT flag a blueprint that the dashboard doesn't flag.
    const redoBlueprints = new Set(
      subs.filter((s) => s.overallJudgement === 'REDO' && s.reviewer.isActive).map((s) => s.blueprintCode),
    );

    let rows = subs;
    if (filters.highRisk) rows = rows.filter((s) => HIGH_RISK_BLUEPRINT_IDS.has(s.blueprintCode));
    if (filters.hasRedo) rows = rows.filter((s) => redoBlueprints.has(s.blueprintCode));

    const sorted = [...rows].sort((a: SubmittedReview, b: SubmittedReview) => {
      const oa = order.get(a.blueprintCode) ?? Number.MAX_SAFE_INTEGER;
      const ob = order.get(b.blueprintCode) ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return a.reviewer.displayName.localeCompare(b.reviewer.displayName, 'zh-Hant');
    });

    return sorted.map((s) => [
      ...buildExportRow(
        s,
        refByCode.get(s.blueprintCode) ?? { exerciseName: '', regionCode: '', isHighRisk: false },
      ),
      // Appended, so the existing columns keep their positions and values exactly (SC-014).
      ...photoColumnsFor(s.blueprintCode, s.reviewer.id, photosByBlueprint),
    ]);
  },
};
