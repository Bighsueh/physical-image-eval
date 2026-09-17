import { beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../../src/config/env';
import { readAndBuildCatalog } from '../../../src/ingestion/parser/build-catalog';
import { collectErrors } from '../../../src/ingestion/validation/invariants';
import type { ParsedCatalog } from '../../../src/ingestion/parser/types';

/**
 * Invariants PASS on the generated valid tree, and each invariant produces a LOCATED ReportError
 * when broken (T013 + T037). Failures are induced by mutating an in-memory clone of the parsed
 * valid catalog — hermetic and fast.
 */
const clone = (c: ParsedCatalog): ParsedCatalog => structuredClone(c);
const invariants = (errors: { invariant: string }[]) => errors.map((e) => e.invariant);

describe('invariants', () => {
  let valid: ParsedCatalog;
  beforeAll(() => {
    valid = readAndBuildCatalog(env.IMAGE_SOURCE_DIR);
  });

  it('PASS — the valid catalog has zero errors (index-declared set, regions, 4 panels, diagnoses, high-risk)', () => {
    expect(collectErrors(valid)).toEqual([]);
  });

  it('FR-004 — a blueprint without exactly 4 panels', () => {
    const c = clone(valid);
    c.blueprints[0].panels.pop();
    expect(invariants(collectErrors(c))).toContain('FR-004:panels');
  });

  it('FR-006 — empty overall metadata', () => {
    const c = clone(valid);
    c.blueprints[0].indications = '';
    expect(invariants(collectErrors(c))).toContain('FR-006:indications');
  });

  it('FR-007 — empty panel action description', () => {
    const c = clone(valid);
    c.blueprints[0].panels[2].actionDescription = '  ';
    expect(invariants(collectErrors(c))).toContain('FR-007:action');
  });

  it('FR-005 — orphan blueprint (no matching image)', () => {
    const c = clone(valid);
    const id = c.blueprints[0].blueprintId;
    c.imageInventory = c.imageInventory.filter((x) => x !== id);
    expect(invariants(collectErrors(c))).toContain('FR-005:orphan-blueprint');
  });

  it('FR-005 — orphan image (image with no blueprint)', () => {
    const c = clone(valid);
    c.imageInventory.push('S99');
    expect(invariants(collectErrors(c))).toContain('FR-005:orphan-image');
  });

  it('FR-002 — a blueprint the index lists but the source lacks', () => {
    const c = clone(valid);
    const [removed] = c.blueprints.splice(0, 1);
    const errors = collectErrors(c);
    expect(errors).toContainEqual(
      expect.objectContaining({ invariant: 'FR-002:missing-blueprint', blueprintId: removed.blueprintId }),
    );
  });

  it('FR-002 — a source blueprint the index does not list', () => {
    const c = clone(valid);
    c.indexBlueprintIds = c.indexBlueprintIds.filter((id) => id !== 'S1');
    expect(collectErrors(c)).toContainEqual(
      expect.objectContaining({ invariant: 'FR-002:unlisted-blueprint', blueprintId: 'S1' }),
    );
  });

  it('FR-003 — a region with no blueprints', () => {
    const c = clone(valid);
    c.blueprints = c.blueprints.filter((b) => b.regionCode !== 'H');
    c.indexBlueprintIds = c.indexBlueprintIds.filter((id) => !id.startsWith('H'));
    c.diagnoses = c.diagnoses.filter((d) => !d.mappedBlueprintId?.startsWith('H'));
    expect(invariants(collectErrors(c))).toContain('FR-003:empty-region');
  });

  it('FR-008 — a gap in the matrix numbering', () => {
    const c = clone(valid);
    const middle = c.diagnoses.find((d) => d.matrixNo === 2)!;
    c.diagnoses = c.diagnoses.filter((d) => d !== middle);
    expect(collectErrors(c)).toContainEqual(
      expect.objectContaining({ invariant: 'FR-008:gap', diagnosisNo: 2 }),
    );
  });

  it('FR-008 — a duplicated matrix number', () => {
    const c = clone(valid);
    c.diagnoses.push({ ...c.diagnoses[0] });
    expect(invariants(collectErrors(c))).toContain('FR-008:dup-matrixNo');
  });

  it('FR-008 — an index with no diagnoses at all', () => {
    const c = clone(valid);
    c.diagnoses = [];
    expect(invariants(collectErrors(c))).toContain('FR-008:empty');
  });

  it('FR-009 — a REFERRAL diagnosis pointing at a blueprint', () => {
    const c = clone(valid);
    const referral = c.diagnoses.find((d) => d.mappingKind === 'REFERRAL')!;
    referral.mappedBlueprintId = 'S1';
    expect(invariants(collectErrors(c))).toContain('FR-009:referral-points');
  });

  it('FR-009 — a mapped diagnosis pointing at a non-existent blueprint', () => {
    const c = clone(valid);
    const mapped = c.diagnoses.find((d) => d.mappingKind === 'MAPPED')!;
    mapped.mappedBlueprintId = 'S99';
    expect(invariants(collectErrors(c))).toContain('FR-009:dangling');
  });

  it('FR-010 — a high-risk blueprint missing from the catalog', () => {
    const c = clone(valid);
    c.blueprints = c.blueprints.filter((b) => b.blueprintId !== 'S4');
    expect(invariants(collectErrors(c))).toContain('FR-010:highrisk-missing');
  });

  it('D6 — id region letter must match its containing folder', () => {
    const c = clone(valid);
    c.blueprints[0].regionCode = c.blueprints[0].regionCode === 'H' ? 'S' : 'H'; // force a mismatch
    expect(invariants(collectErrors(c))).toContain('D6:id-folder');
  });

  it('FR-022 — illegal and duplicate ids', () => {
    const illegal = clone(valid);
    illegal.blueprints[0].blueprintId = 'Z9';
    expect(invariants(collectErrors(illegal))).toContain('FR-022:legal-id');

    const dup = clone(valid);
    dup.blueprints[1].blueprintId = dup.blueprints[0].blueprintId;
    expect(invariants(collectErrors(dup))).toContain('FR-022:unique-id');
  });
});
