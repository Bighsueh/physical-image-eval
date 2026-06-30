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

  listBlueprints(filters: { region?: RegionCode; highRisk?: boolean }) {
    return prisma.blueprint.findMany({
      where: {
        ...(filters.region ? { region: { regionCode: filters.region } } : {}),
        ...(typeof filters.highRisk === 'boolean' ? { isHighRisk: filters.highRisk } : {}),
      },
      include: {
        region: { select: { regionCode: true, displayOrder: true } },
        _count: { select: { diagnoses: true } },
      },
      orderBy: [{ region: { displayOrder: 'asc' } }, { blueprintId: 'asc' }],
    });
  },

  getBlueprintDetail(blueprintId: string) {
    return prisma.blueprint.findUnique({
      where: { blueprintId },
      include: {
        region: { select: { regionCode: true, nameZh: true } },
        panels: { orderBy: { panelIndex: 'asc' } },
        diagnoses: { orderBy: { matrixNo: 'asc' } },
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
