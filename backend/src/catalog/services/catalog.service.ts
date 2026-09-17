import type { MappingKind, RegionCode } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { parseBlueprintId } from '../../ingestion/parser/id-region';
import {
  toBlueprintDetailDto,
  toBlueprintSummaryDto,
  toDiagnosisDto,
  toRegionDto,
} from '../dto/blueprint-public.dto';
import { catalogRepository } from '../repositories/catalog.repository';

/** Order blueprints by region displayOrder, then NUMERIC serial (Y1 < Y2 < … < Y12, not Y1,Y10…). */
const byRegionThenSerial = (
  a: { blueprintId: string; region: { displayOrder: number } },
  b: { blueprintId: string; region: { displayOrder: number } },
): number => {
  if (a.region.displayOrder !== b.region.displayOrder) {
    return a.region.displayOrder - b.region.displayOrder;
  }
  return (parseBlueprintId(a.blueprintId)?.serial ?? 0) - (parseBlueprintId(b.blueprintId)?.serial ?? 0);
};

/** Compose repository + public DTO. Never returns aiPrompt/contentHash/sourceMarkdownRef (D7). */
export const catalogService = {
  async listRegions() {
    return (await catalogRepository.listRegions()).map(toRegionDto);
  },

  /** Live catalog size — the progress denominator (never a hard-coded constant). */
  countBlueprints(): Promise<number> {
    return catalogRepository.countBlueprints();
  },

  async listBlueprints(filters: { region?: RegionCode; highRisk?: boolean }) {
    const rows = await catalogRepository.listBlueprints(filters);
    return [...rows].sort(byRegionThenSerial).map(toBlueprintSummaryDto);
  },

  async getBlueprintDetail(blueprintId: string) {
    const bp = await catalogRepository.getBlueprintDetail(blueprintId);
    if (!bp) throw new AppError('BLUEPRINT_NOT_FOUND');
    return toBlueprintDetailDto(bp);
  },

  async listDiagnoses(filters: { mappingKind?: MappingKind; blueprintId?: string }) {
    const [rows, recon] = await Promise.all([
      catalogRepository.listDiagnoses(filters),
      catalogRepository.reconciliation(),
    ]);
    return { data: rows.map(toDiagnosisDto), meta: recon };
  },
};
