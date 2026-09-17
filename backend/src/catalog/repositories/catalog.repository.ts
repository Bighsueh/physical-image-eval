import type { MappingKind, RegionCode } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/** Prisma read access for the catalog (constitution XI — read-only domain). */

export const catalogRepository = {
  listRegions() {
    return prisma.region.findMany({
      orderBy: { displayOrder: 'asc' },
      include: { _count: { select: { blueprints: true } } },
    });
  },

  countBlueprints() {
    return prisma.blueprint.count();
  },

  listBlueprints(filters: { region?: RegionCode; highRisk?: boolean }) {
    // select: (not include:) so aiPrompt/contentHash/sourceMarkdownRef are never fetched (SEC-M1).
    return prisma.blueprint.findMany({
      where: {
        ...(filters.region ? { region: { regionCode: filters.region } } : {}),
        ...(typeof filters.highRisk === 'boolean' ? { isHighRisk: filters.highRisk } : {}),
      },
      select: {
        blueprintId: true,
        exerciseName: true,
        isHighRisk: true,
        region: { select: { regionCode: true, displayOrder: true } },
        _count: { select: { diagnoses: true } },
      },
      orderBy: { region: { displayOrder: 'asc' } }, // serial order applied numerically in the service
    });
  },

  getBlueprintDetail(blueprintId: string) {
    return prisma.blueprint.findUnique({
      where: { blueprintId },
      select: {
        blueprintId: true,
        exerciseName: true,
        indications: true,
        frequency: true,
        gentleReminder: true,
        version: true,
        isHighRisk: true,
        region: { select: { regionCode: true, nameZh: true } },
        panels: {
          orderBy: { panelIndex: 'asc' },
          select: {
            panelIndex: true,
            stepName: true,
            actionDescription: true,
            timingHint: true,
            visualDescription: true,
          },
        },
        diagnoses: {
          orderBy: { matrixNo: 'asc' },
          select: { matrixNo: true, nameZh: true, mappingKind: true },
        },
      },
    });
  },

  listDiagnoses(filters: { mappingKind?: MappingKind; blueprintId?: string }) {
    return prisma.diagnosis.findMany({
      where: {
        ...(filters.mappingKind ? { mappingKind: filters.mappingKind } : {}),
        ...(filters.blueprintId ? { mappedBlueprint: { blueprintId: filters.blueprintId } } : {}),
      },
      include: { mappedBlueprint: { select: { blueprintId: true } } },
      orderBy: { matrixNo: 'asc' },
    });
  },

  /** Full reconciliation over ALL diagnoses (for list `meta`, regardless of filters). */
  async reconciliation() {
    const grouped = await prisma.diagnosis.groupBy({ by: ['mappingKind'], _count: { _all: true } });
    const get = (k: MappingKind) => grouped.find((g) => g.mappingKind === k)?._count._all ?? 0;
    const mapped = get('MAPPED');
    const template = get('TEMPLATE');
    const referral = get('REFERRAL');
    return { total: mapped + template + referral, mapped, template, referral };
  },

  /** Stored relative image path for the image route (D5). */
  imagePathFor(blueprintId: string) {
    return prisma.blueprint.findUnique({ where: { blueprintId }, select: { imagePath: true } });
  },
};
