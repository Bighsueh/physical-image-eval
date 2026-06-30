import { beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../../src/config/env';
import { readAndBuildCatalog } from '../../../src/ingestion/parser/build-catalog';
import { computeWarnings } from '../../../src/ingestion/validation/report';
import type { ParsedCatalog } from '../../../src/ingestion/parser/types';

/** FR-021 — non-fatal warnings, distinct from errors. */
describe('warnings (FR-021)', () => {
  let valid: ParsedCatalog;
  beforeAll(() => {
    valid = readAndBuildCatalog(env.IMAGE_SOURCE_DIR);
  });

  it('the valid catalog produces no warnings', () => {
    expect(computeWarnings(valid)).toEqual([]);
  });

  it('flags an empty timingHint / visualDescription (non-fatal)', () => {
    const c = structuredClone(valid);
    c.blueprints[0].panels[0].timingHint = null;
    c.blueprints[0].panels[0].visualDescription = null;
    const w = computeWarnings(c);
    expect(w.some((x) => x.message.includes('時間提示'))).toBe(true);
    expect(w.some((x) => x.message.includes('畫面視覺描述'))).toBe(true);
  });

  it('flags a blueprint with 0 covered diagnoses', () => {
    const c = structuredClone(valid);
    const id = c.blueprints[0].blueprintId;
    c.diagnoses = c.diagnoses.filter((d) => d.mappedBlueprintId !== id);
    expect(computeWarnings(c).some((x) => x.blueprintId === id && x.message.includes('0 筆'))).toBe(true);
  });

  it('surfaces an unknown top-level folder as a warning (not a hard error)', () => {
    const c = structuredClone(valid);
    c.unknownFolders = ['99_未知區域'];
    expect(computeWarnings(c).some((x) => x.message.includes('99_未知區域'))).toBe(true);
  });
});
