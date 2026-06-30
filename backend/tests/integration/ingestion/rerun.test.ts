import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { env } from '../../../src/config/env';
import { prisma } from '../../../src/lib/prisma';
import { runIngest } from '../../../src/ingestion/runner';
import { buildValidSource, mutateEditMetadata } from '../../fixtures/generate';

const hashes = async (): Promise<Record<string, string>> => {
  const bps = await prisma.blueprint.findMany({ select: { blueprintId: true, contentHash: true } });
  return Object.fromEntries(bps.map((b) => [b.blueprintId, b.contentHash]));
};

describe('re-run idempotency + diff (US3)', () => {
  it('ingesting unchanged source twice yields an equivalent catalog with an empty diff', async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
    const first = await hashes();
    const res = await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR });
    const second = await hashes();

    expect(await prisma.blueprint.count()).toBe(51); // no duplicates/drift (SC-003)
    expect(second).toEqual(first);
    expect(res.report?.diff).toEqual({ added: [], modified: [], removed: [] });
  });

  it('a single metadata edit re-run shows only modified=[that id] (SC-007)', async () => {
    await runIngest({ sourceDir: env.IMAGE_SOURCE_DIR }); // baseline
    const dir = mkdtempSync(join(tmpdir(), 'pie-edit-'));
    try {
      buildValidSource(dir);
      mutateEditMetadata(dir, 'S1', '全新的適應症描述文字');
      const res = await runIngest({ sourceDir: dir });

      expect(res.exitCode).toBe(0);
      expect(res.report?.diff?.modified).toContain('S1');
      expect(res.report?.diff?.added).toEqual([]);
      expect(res.report?.diff?.removed).toEqual([]);

      const s1 = await prisma.blueprint.findUnique({ where: { blueprintId: 'S1' } });
      expect(s1?.indications).toBe('全新的適應症描述文字'); // catalog reflects the new text
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
