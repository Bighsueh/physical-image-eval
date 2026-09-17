import { beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../../src/config/env';
import { prisma } from '../../../src/lib/prisma';
import { runIngest, type RunIngestResult } from '../../../src/ingestion/runner';
import { ALL_REGION_CODES } from '../../../src/catalog/constants/catalog-constants';
import {
  FIXTURE_MAPPED_DIAGNOSES,
  FIXTURE_REFERRAL_DIAGNOSES,
  FIXTURE_REGION_COUNTS,
  FIXTURE_TOTAL_BLUEPRINTS,
  FIXTURE_TOTAL_DIAGNOSES,
} from '../../fixtures/generate';

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

  it('persists every fixture blueprint with the fixture region distribution', async () => {
    expect(await prisma.blueprint.count()).toBe(FIXTURE_TOTAL_BLUEPRINTS);
    const regions = await prisma.region.findMany({
      include: { _count: { select: { blueprints: true } } },
      orderBy: { displayOrder: 'asc' },
    });
    expect(regions.map((r) => r._count.blueprints)).toEqual(
      ALL_REGION_CODES.map((code) => FIXTURE_REGION_COUNTS[code]),
    );
  });

  it('persists exactly 4 panels per blueprint', async () => {
    expect(await prisma.panel.count()).toBe(FIXTURE_TOTAL_BLUEPRINTS * 4);
    const grouped = await prisma.panel.groupBy({ by: ['blueprintId'], _count: { _all: true } });
    expect(grouped.every((g) => g._count._all === 4)).toBe(true);
  });

  it('persists every index diagnosis, split into mapped+template and referral', async () => {
    expect(await prisma.diagnosis.count()).toBe(FIXTURE_TOTAL_DIAGNOSES);
    expect(await prisma.diagnosis.count({ where: { mappingKind: 'REFERRAL' } })).toBe(
      FIXTURE_REFERRAL_DIAGNOSES,
    );
    expect(
      await prisma.diagnosis.count({ where: { mappingKind: { in: ['MAPPED', 'TEMPLATE'] } } }),
    ).toBe(FIXTURE_MAPPED_DIAGNOSES);
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
