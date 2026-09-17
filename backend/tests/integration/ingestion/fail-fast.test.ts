import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../../src/config/env';
import { prisma } from '../../../src/lib/prisma';
import { runIngest } from '../../../src/ingestion/runner';
import {
  buildValidSource,
  mutateBlankMetadata,
  mutateDeleteBlueprint,
  mutateDeleteImage,
  mutateDropDiagnosis,
  mutateDuplicateId,
  mutateEmptyAction,
  mutateOrphanImage,
  mutatePanelCount,
} from '../../fixtures/generate';

/**
 * US2 — every broken source aborts with exit 1, names the failing invariant (located), and leaves
 * the prior catalog fully intact (FR-011/FR-015/SC-002/SC-004). A valid catalog is ingested first
 * as the baseline; each broken ingest must NOT change it.
 */
const counts = async () => ({
  regions: await prisma.region.count(),
  blueprints: await prisma.blueprint.count(),
  panels: await prisma.panel.count(),
  diagnoses: await prisma.diagnosis.count(),
});

const withBroken = async (mutate: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), 'pie-broken-'));
  try {
    buildValidSource(dir);
    mutate(dir);
    const before = await counts();
    const res = await runIngest({ sourceDir: dir });
    const after = await counts();
    return { res, before, after };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const cases: Array<[string, (dir: string) => void, string]> = [
  ['3 panels', (d) => mutatePanelCount(d, 'S1', 3), 'FR-004'],
  ['5 panels', (d) => mutatePanelCount(d, 'S1', 5), 'FR-004'],
  ['missing metadata', (d) => mutateBlankMetadata(d, 'S1', '適應症'), 'FR-006'],
  ['empty action', (d) => mutateEmptyAction(d, 'S1'), 'FR-007'],
  ['orphan blueprint', (d) => mutateDeleteImage(d, 'S1'), 'FR-005'],
  ['orphan image', (d) => mutateOrphanImage(d, 'S', 'S99'), 'FR-005'],
  ['recon mismatch', (d) => mutateDropDiagnosis(d), 'FR-008'],
  ['duplicate id', (d) => mutateDuplicateId(d, 'S1'), 'FR-022'],
  ['blueprint missing', (d) => mutateDeleteBlueprint(d, 'S1'), 'FR-002'],
];

describe('fail-fast on broken source (US2)', () => {
  beforeAll(async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR }); // baseline good catalog
  });

  it.each(cases)('%s → exit 1, located error, catalog unchanged', async (_name, mutate, prefix) => {
    const { res, before, after } = await withBroken(mutate);
    expect(res.exitCode).toBe(1);
    expect(res.report?.errors.some((e) => e.invariant.startsWith(prefix))).toBe(true);
    // a located error carries a blueprintId / panelIndex / diagnosisNo (SC-004)
    expect(
      res.report?.errors.some((e) => e.blueprintId || e.panelIndex || e.diagnosisNo || e.invariant),
    ).toBe(true);
    expect(after).toEqual(before); // FR-011 / FR-015 — no partial overwrite
  });
});
