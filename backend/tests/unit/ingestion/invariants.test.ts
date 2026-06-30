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

  it('PASS — the valid catalog has zero errors (51, region counts, 4 panels, 134, high-risk)', () => {
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

  it('FR-002/FR-003 — removing a blueprint breaks the count + region count', () => {
    const c = clone(valid);
    c.blueprints.shift();
    const ids = invariants(collectErrors(c));
    expect(ids).toContain('FR-002:count');
    expect(ids).toContain('FR-003:region-count');
  });

  it('FR-008 — dropping a diagnosis breaks reconciliation', () => {
    const c = clone(valid);
    c.diagnoses.pop();
    expect(invariants(collectErrors(c))).toContain('FR-008:total');
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
