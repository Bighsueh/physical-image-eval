import { describe, expect, it } from 'vitest';
import {
  idMatchesFolder,
  isLegalBlueprintId,
  parseBlueprintId,
  regionCodeForFolder,
} from '../../../src/ingestion/parser/id-region';

describe('id-region (FR-022, D6)', () => {
  it('accepts legal ids (region letter + 1–2 digit serial)', () => {
    expect(isLegalBlueprintId('S1')).toBe(true);
    expect(isLegalBlueprintId('Y12')).toBe(true);
    expect(parseBlueprintId('K7')).toEqual({ regionCode: 'K', serial: 7 });
  });

  it('rejects illegal ids', () => {
    expect(isLegalBlueprintId('Z9')).toBe(false); // not a region letter
    expect(isLegalBlueprintId('S0')).toBe(false); // serial must start 1-9
    expect(isLegalBlueprintId('S')).toBe(false);
    expect(parseBlueprintId('Z9')).toBeNull();
  });

  it('maps source folders to region codes', () => {
    expect(regionCodeForFolder('01_肩部_SHOULDER')).toBe('S');
    expect(regionCodeForFolder('08_全身運動處方_SYSTEMIC')).toBe('Y');
    expect(regionCodeForFolder('99_unknown')).toBeUndefined();
  });

  it('cross-checks id letter against its containing folder', () => {
    expect(idMatchesFolder('S1', '01_肩部_SHOULDER')).toBe(true);
    expect(idMatchesFolder('S1', '02_頭頸部_HEAD_NECK')).toBe(false);
    expect(idMatchesFolder('Z9', '01_肩部_SHOULDER')).toBe(false);
  });
});
