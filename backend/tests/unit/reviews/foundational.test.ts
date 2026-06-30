import { describe, expect, it } from 'vitest';
import {
  OVERALL_ID_TO_ZH,
  OVERALL_ZH_TO_ID,
  PROBLEM_ID_TO_ZH,
  PROBLEM_ZH_TO_ID,
  WARNING_ID_TO_ZH,
  WARNING_ZH_TO_ID,
} from '../../../src/reviews/dto/enum-maps';
import { documentToWrite, escapeHtml, toReviewPayload } from '../../../src/reviews/dto/review.dto';
import { reviewDocumentSchema } from '../../../src/reviews/validation/review.schema';
import { docWithPanel, emptyDoc } from '../../helpers/review';

describe('enum maps (D2)', () => {
  it('round-trips every value for the multi-select enums', () => {
    for (const [id, zh] of Object.entries(WARNING_ID_TO_ZH)) expect(WARNING_ZH_TO_ID[zh]).toBe(id);
    for (const [id, zh] of Object.entries(PROBLEM_ID_TO_ZH)) expect(PROBLEM_ZH_TO_ID[zh]).toBe(id);
    expect(OVERALL_ZH_TO_ID[OVERALL_ID_TO_ZH.PASS]).toBe('PASS');
  });

  it('maps a wire document to Prisma ids (and rejects unknowns via schema)', () => {
    const doc = reviewDocumentSchema.parse(
      docWithPanel(1, { requiredWarnings: ['注意跌倒', '骨鬆注意'], problemTypes: ['有錯字'] }, { overallJudgement: '通過' }),
    );
    const write = documentToWrite(doc);
    expect(write.overallJudgement).toBe('PASS');
    expect(write.panels[0].requiredWarnings).toEqual(['FALL_RISK', 'OSTEOPOROSIS']);
    expect(write.panels[0].problemTypes).toEqual(['TYPO']);
  });
});

describe('review document schema (D3)', () => {
  it('accepts an all-empty 4-panel doc (clean image)', () => {
    expect(reviewDocumentSchema.safeParse(emptyDoc()).success).toBe(true);
  });

  it('requires exactly 4 panels with indices 1..4', () => {
    expect(reviewDocumentSchema.safeParse(emptyDoc({ panels: emptyDoc().panels.slice(0, 3) })).success).toBe(false);
    const dup = emptyDoc();
    dup.panels[1].panelIndex = 1; // duplicate index
    expect(reviewDocumentSchema.safeParse(dup).success).toBe(false);
  });

  it('rejects an unknown enum value and dedupes multi-selects', () => {
    expect(reviewDocumentSchema.safeParse(emptyDoc({ overallJudgement: 'NOPE' })).success).toBe(false);
    const parsed = reviewDocumentSchema.parse(docWithPanel(1, { requiredWarnings: ['注意跌倒', '注意跌倒'] }));
    expect(parsed.panels[0].requiredWarnings).toEqual(['注意跌倒']);
  });

  it('strips client-sent status/timestamps', () => {
    const parsed = reviewDocumentSchema.parse({ ...emptyDoc(), status: '已提交', submittedAt: 'x' } as never);
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('submittedAt');
  });
});

describe('review DTO output (D2/V)', () => {
  it('renders an empty 未開始 template for a null review', () => {
    const payload = toReviewPayload(null);
    expect(payload.status).toBe('未開始');
    expect(payload.panels).toHaveLength(4);
    expect(payload.overallJudgement).toBeNull();
  });

  it('HTML-escapes free text on output (orphan text preserved verbatim in storage)', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(null)).toBeNull();
  });
});
