import { describe, expect, it } from 'vitest';
import { EXPORT_HEADER } from '../../../src/admin-dashboard/constants/dashboard-constants';
import { serializeCsv } from '../../../src/admin-dashboard/csv/csv-serializer';
import { encodeSet } from '../../../src/admin-dashboard/csv/multiselect-encode';
import { buildExportRow } from '../../../src/admin-dashboard/dto/export-record.dto';
import {
  buildDrillDown,
  buildImageProgress,
  buildReviewerProgress,
} from '../../../src/admin-dashboard/services/progress.service';
import { completionPercent } from '../../../src/admin-dashboard/services/completion-ratio';
import type { SubmittedPanel, SubmittedReview } from '../../../src/admin-dashboard/repositories/review-read.repository';

const reviewer = (id: string, isActive = true) => ({ id, displayName: `R${id}`, isActive });
const emptyPanels = (): SubmittedPanel[] => [1, 2, 3, 4].map((panelIndex) => ({ panelIndex, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null }));
const sub = (id: string, code: string, overall: SubmittedReview['overallJudgement'], isActive = true, panels: SubmittedPanel[] = emptyPanels()): SubmittedReview => ({
  blueprintCode: code,
  overallJudgement: overall,
  indicationJudgement: null,
  indicationNote: null,
  submittedAt: new Date('2026-06-30T05:00:00Z'),
  reviewer: reviewer(id, isActive),
  panels,
});
const bp = (blueprintId: string, isHighRisk = false) => ({ blueprintId, exerciseName: `${blueprintId}名`, regionCode: blueprintId[0], isHighRisk });

describe('completionPercent (active basis, FR-002)', () => {
  it('computes, caps at 100, and returns 0 on a zero denominator', () => {
    expect(completionPercent(40, 160)).toBeCloseTo(25.0, 1);
    expect(completionPercent(3, 120)).toBeCloseTo(2.5, 1);
    expect(completionPercent(0, 0)).toBe(0);
    expect(completionPercent(60, 40)).toBe(100); // never > 100
  });
});

describe('csv-serializer (FR-020)', () => {
  it('prepends BOM, uses CRLF, RFC-4180 quotes, and neutralizes formula injection', () => {
    const out = serializeCsv(['a', 'b'], [['x,y', '=cmd'], ['quote"d', 'plain']]);
    expect(out.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(out).toContain('a,b\r\n');
    expect(out).toContain('"x,y"'); // comma → quoted
    expect(out).toContain("'=cmd"); // formula neutralized
    expect(out).toContain('"quote""d"'); // embedded quote doubled + quoted
    expect(out.endsWith('\r\n')).toBe(true);
  });
});

describe('encodeSet (FR-015/017)', () => {
  it('pipe-delimits members; empty set → empty string', () => {
    expect(encodeSet(['注意跌倒', '骨鬆注意'])).toBe('注意跌倒|骨鬆注意');
    expect(encodeSet([])).toBe('');
  });
});

describe('buildExportRow (FR-014/015)', () => {
  it('a clean 通過 record still emits all 27 columns with empty panel cells', () => {
    const row = buildExportRow(sub('1', 'S1', 'PASS'), { exerciseName: '五十肩', regionCode: 'S', isHighRisk: false });
    expect(row).toHaveLength(EXPORT_HEADER.length);
    expect(row[7]).toBe('通過'); // 整體判定
    expect(row[8]).toBe('否'); // 含需重做
    expect(row[6]).toBe('否'); // 高風險
    expect(row.slice(11, 27).every((c) => c === '')).toBe(true); // 16 panel cells empty
  });

  it('encodes multi-selects and marks 含需重做', () => {
    const row = buildExportRow(
      sub('2', 'S1', 'REDO', true, [
        { panelIndex: 1, requiredWarnings: ['OSTEOPOROSIS'], warningOther: null, problemTypes: ['TYPO'], problemNote: '錯字' },
        ...emptyPanels().slice(1),
      ]),
      { exerciseName: '五十肩', regionCode: 'S', isHighRisk: true },
    );
    expect(row[8]).toBe('是'); // 含需重做
    expect(row[6]).toBe('是'); // 高風險
    expect(row[11]).toBe('骨鬆注意'); // 圖1 警語
    expect(row[13]).toBe('有錯字'); // 圖1 問題類型
    expect(row[14]).toBe('錯字'); // 圖1 問題說明
  });
});

describe('progress builders (FR-005/006/008)', () => {
  const reviewers = [reviewer('1'), reviewer('2'), reviewer('3'), reviewer('4', false)];
  const subs = [sub('1', 'S1', 'PASS'), sub('2', 'S1', 'REDO'), sub('4', 'S1', 'PASS', false)];

  it('distribution counts active submitters only; inactive separate; disagreement', () => {
    const [s1] = buildImageProgress(reviewers, subs, [bp('S1')]);
    expect(s1.distribution).toEqual({ 通過: 1, 需小修: 0, 需重做: 1 });
    expect(s1.submittedActiveCount).toBe(2);
    expect(s1.inactiveSubmittedCount).toBe(1);
    expect(s1.missingReviewers.map((m) => m.displayName)).toEqual(['R3']);
    const drill = buildDrillDown(s1, subs);
    expect(drill.rows).toHaveLength(3);
    expect(drill.hasDisagreement).toBe(true);
  });

  it('reviewer progress: unreviewed = all minus submitted; 0-submission reviewer', () => {
    const rows = buildReviewerProgress(reviewers, subs, [bp('S1'), bp('S2')]);
    const r3 = rows.find((r) => r.accountId === '3')!;
    expect(r3.submittedCount).toBe(0);
    expect(r3.unreviewedBlueprintIds).toEqual(['S1', 'S2']);
    expect(rows[rows.length - 1].accountId).toBe('4'); // 非在職 last
  });
});
