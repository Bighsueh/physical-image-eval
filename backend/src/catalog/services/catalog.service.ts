import type { MappingKind, RegionCode } from '@prisma/client';
import { AppError } from '../../lib/errors';
import {
  toBlueprintDetailDto,
  toBlueprintSummaryDto,
  toDiagnosisDto,
  toRegionDto,
} from '../dto/blueprint-public.dto';
import { catalogRepository } from '../repositories/catalog.repository';

/** Compose repository + public DTO. Never returns aiPrompt/contentHash/sourceMarkdownRef (D7). */
export const catalogService = {
  async listRegions() {
    return (await catalogRepository.listRegions()).map(toRegionDto);
  },

  async listBlueprints(filters: { region?: RegionCode; highRisk?: boolean }) {
    return (await catalogRepository.listBlueprints(filters)).map(toBlueprintSummaryDto);
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
