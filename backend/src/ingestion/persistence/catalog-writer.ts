import type { RegionCode } from '@prisma/client';
import {
  ALL_REGION_CODES,
  HIGH_RISK_BLUEPRINT_IDS,
  REGION_NAME_MAP,
} from '../../catalog/constants/catalog-constants';
import { parseBlueprintId } from '../parser/id-region';
import { prisma } from '../../lib/prisma';
import type { ParsedCatalog } from '../parser/types';

/**
 * Phase B (D3/D4): ONE transaction that snapshot-replaces the whole catalog — delete all rows in FK
 * order, then insert Region/Blueprint(+Panel)/Diagnosis in a deterministic fixed order. Because the
 * parsed set is a pure function of source content, re-running on unchanged source yields an
 * equivalent catalog with no duplicates/drift (FR-013/FR-017/SC-003).
 */
const byBlueprintId = (a: { blueprintId: string }, b: { blueprintId: string }): number => {
  const pa = parseBlueprintId(a.blueprintId);
  const pb = parseBlueprintId(b.blueprintId);
  if (!pa || !pb) return a.blueprintId.localeCompare(b.blueprintId);
  if (pa.regionCode !== pb.regionCode) return pa.regionCode.localeCompare(pb.regionCode);
  return pa.serial - pb.serial;
};

export const writeCatalog = async (catalog: ParsedCatalog): Promise<void> => {
  await prisma.$transaction(
    async (tx) => {
      await tx.diagnosis.deleteMany();
      await tx.panel.deleteMany();
      await tx.blueprint.deleteMany();
      await tx.region.deleteMany();

      const regionIdByCode = new Map<RegionCode, string>();
      for (const code of ALL_REGION_CODES) {
        const meta = REGION_NAME_MAP[code];
        const region = await tx.region.create({
          data: { regionCode: code, nameZh: meta.nameZh, nameEn: meta.nameEn, displayOrder: meta.displayOrder },
        });
        regionIdByCode.set(code, region.id);
      }

      const blueprintIdByBusiness = new Map<string, string>();
      for (const b of [...catalog.blueprints].sort(byBlueprintId)) {
        const created = await tx.blueprint.create({
          data: {
            blueprintId: b.blueprintId,
            regionId: regionIdByCode.get(b.regionCode)!,
            exerciseName: b.exerciseName,
            indications: b.indications,
            frequency: b.frequency,
            gentleReminder: b.gentleReminder,
            imagePath: b.imagePath,
            sourceMarkdownRef: b.sourceMarkdownRef,
            version: b.version,
            contentHash: b.contentHash,
            isHighRisk: HIGH_RISK_BLUEPRINT_IDS.has(b.blueprintId),
            aiPrompt: b.aiPrompt,
            panels: {
              create: [...b.panels]
                .sort((p, q) => p.panelIndex - q.panelIndex)
                .map((p) => ({
                  panelIndex: p.panelIndex,
                  stepName: p.stepName,
                  actionDescription: p.actionDescription,
                  timingHint: p.timingHint,
                  visualDescription: p.visualDescription,
                })),
            },
          },
        });
        blueprintIdByBusiness.set(b.blueprintId, created.id);
      }

      for (const d of [...catalog.diagnoses].sort((a, c) => a.matrixNo - c.matrixNo)) {
        await tx.diagnosis.create({
          data: {
            matrixNo: d.matrixNo,
            nameZh: d.nameZh,
            mappingKind: d.mappingKind,
            mappedBlueprintId: d.mappedBlueprintId
              ? (blueprintIdByBusiness.get(d.mappedBlueprintId) ?? null)
              : null,
          },
        });
      }
    },
    { timeout: 60_000 },
  );
};
