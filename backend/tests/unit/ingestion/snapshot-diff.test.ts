import { describe, expect, it } from 'vitest';
import { computeDiff, type CatalogSnapshot } from '../../../src/ingestion/diff/snapshot-diff';
import type { ParsedCatalog } from '../../../src/ingestion/parser/types';

/** Pure computeDiff (D4) — blueprints by id+contentHash, diagnoses by matrixNo+mapping. */
const nextCatalog = (
  blueprints: Array<{ blueprintId: string; contentHash: string }>,
  diagnoses: Array<{ matrixNo: number; mappingKind: string; mappedBlueprintId: string | null }>,
): ParsedCatalog =>
  ({ blueprints, diagnoses, imageInventory: [] }) as unknown as ParsedCatalog;

describe('snapshot-diff (US3, D4)', () => {
  it('reports an empty diff for an identical snapshot', () => {
    const prev: CatalogSnapshot = {
      blueprintHash: new Map([['S1', 'h1']]),
      diagnosisKey: new Map([[4, 'MAPPED|S1']]),
    };
    const diff = computeDiff(prev, nextCatalog([{ blueprintId: 'S1', contentHash: 'h1' }], [
      { matrixNo: 4, mappingKind: 'MAPPED', mappedBlueprintId: 'S1' },
    ]));
    expect(diff).toEqual({ added: [], modified: [], removed: [] });
  });

  it('detects added / removed / modified blueprints', () => {
    const prev: CatalogSnapshot = {
      blueprintHash: new Map([['S1', 'h1'], ['S2', 'h2']]),
      diagnosisKey: new Map(),
    };
    const diff = computeDiff(prev, nextCatalog(
      [{ blueprintId: 'S1', contentHash: 'h1-NEW' }, { blueprintId: 'S3', contentHash: 'h3' }],
      [],
    ));
    expect(diff.modified).toContain('S1'); // hash changed
    expect(diff.added).toContain('S3'); // new
    expect(diff.removed).toContain('S2'); // gone
  });

  it('detects a diagnosis remap as a modified 診斷#N entry', () => {
    const prev: CatalogSnapshot = {
      blueprintHash: new Map(),
      diagnosisKey: new Map([[56, 'MAPPED|E3']]),
    };
    const diff = computeDiff(prev, nextCatalog([], [
      { matrixNo: 56, mappingKind: 'MAPPED', mappedBlueprintId: 'E4' },
    ]));
    expect(diff.modified).toContain('診斷#56');
  });
});
