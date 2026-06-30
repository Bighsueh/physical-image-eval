import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { env } from '../../../src/config/env';
import { prisma } from '../../../src/lib/prisma';
import { runIngest } from '../../../src/ingestion/runner';
import { buildValidSource, mutateEmptyAction } from '../../fixtures/generate';

/** US2 — read-only guarantee, missing-source exit 2, and the --check dry-run (FR-001/FR-018/SC-005). */

const snapshotMtimes = (dir: string): Map<string, number> => {
  const out = new Map<string, number>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else out.set(full, st.mtimeMs);
    }
  };
  walk(dir);
  return out;
};

describe('ingestion safety (US2)', () => {
  it('never modifies the source on a SUCCESSFUL ingest (SC-005, FR-001)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pie-ro-ok-'));
    try {
      buildValidSource(dir);
      const before = snapshotMtimes(dir);
      const res = await runIngest({ sourceDir: dir });
      expect(res.exitCode).toBe(0);
      expect(snapshotMtimes(dir)).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never modifies the source on a FAILING ingest (SC-005, FR-001)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pie-ro-bad-'));
    try {
      buildValidSource(dir);
      mutateEmptyAction(dir, 'S1');
      const before = snapshotMtimes(dir);
      const res = await runIngest({ sourceDir: dir });
      expect(res.exitCode).toBe(1);
      expect(snapshotMtimes(dir)).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 2 on a missing/unreadable source without overwriting the catalog (FR-018)', async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR }); // good baseline
    const before = await prisma.blueprint.count();
    const res = await runIngest({ sourceDir: '/nonexistent/pie/source/dir' });
    expect(res.exitCode).toBe(2);
    expect(await prisma.blueprint.count()).toBe(before); // unchanged
  });

  it('--check validates + reports but writes 0 rows (dry-run)', async () => {
    // start from an empty catalog
    await prisma.$transaction([
      prisma.diagnosis.deleteMany(),
      prisma.panel.deleteMany(),
      prisma.blueprint.deleteMany(),
      prisma.region.deleteMany(),
    ]);
    const res = await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR, check: true });
    expect(res.exitCode).toBe(0);
    expect(res.report?.ok).toBe(true);
    expect(await prisma.blueprint.count()).toBe(0); // dry-run persisted nothing
  });
});
