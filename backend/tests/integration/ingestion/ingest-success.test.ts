import { beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../../src/config/env';
import { prisma } from '../../../src/lib/prisma';
import { runIngest, type RunIngestResult } from '../../../src/ingestion/runner';

/** US1 — a valid source ingests to a correct catalog (SC-001). */
describe('ingest success (US1)', () => {
  let result: RunIngestResult;
  beforeAll(async () => {
    result = await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
  });

  it('exits 0 with a passing report', () => {
    expect(result.exitCode).toBe(0);
    expect(result.report?.ok).toBe(true);
    expect(result.report?.errors).toEqual([]);
  });

  it('persists 51 blueprints with the S4 H4 E6 T8 P5 K7 L5 Y12 distribution', async () => {
    expect(await prisma.blueprint.count()).toBe(51);
    const regions = await prisma.region.findMany({
      include: { _count: { select: { blueprints: true } } },
      orderBy: { displayOrder: 'asc' },
    });
    expect(regions.map((r) => r._count.blueprints)).toEqual([4, 4, 6, 8, 5, 7, 5, 12]);
  });

  it('persists exactly 4 panels per blueprint', async () => {
    expect(await prisma.panel.count()).toBe(51 * 4);
    const grouped = await prisma.panel.groupBy({ by: ['blueprintId'], _count: { _all: true } });
    expect(grouped.every((g) => g._count._all === 4)).toBe(true);
  });

  it('persists 134 diagnoses = 128 (mapped+template) + 6 referral', async () => {
    expect(await prisma.diagnosis.count()).toBe(134);
    expect(await prisma.diagnosis.count({ where: { mappingKind: 'REFERRAL' } })).toBe(6);
    expect(
      await prisma.diagnosis.count({ where: { mappingKind: { in: ['MAPPED', 'TEMPLATE'] } } }),
    ).toBe(128);
  });

  it('marks exactly the high-risk set', async () => {
    const hr = await prisma.blueprint.findMany({
      where: { isHighRisk: true },
      select: { blueprintId: true },
    });
    expect(hr.map((b) => b.blueprintId).sort()).toEqual([
      'K2',
      'K3',
      'K5',
      'L3',
      'P1',
      'P4',
      'P5',
      'S4',
      'T8',
    ]);
  });
});
