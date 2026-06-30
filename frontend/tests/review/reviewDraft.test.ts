import { describe, expect, it } from 'vitest';
import type { ReviewState } from '../../src/api/reviews';
import { emptyDraft, reviewDraftReducer, reviewToDraft } from '../../src/state/reviewDraft';

describe('reviewDraftReducer (immutable)', () => {
  it('every action returns a NEW object and never mutates the input', () => {
    const s0 = emptyDraft();
    const s1 = reviewDraftReducer(s0, { type: 'overall', value: '通過' });
    expect(s1).not.toBe(s0);
    expect(s0.overallJudgement).toBeNull(); // original untouched
    expect(s1.overallJudgement).toBe('通過');

    const s2 = reviewDraftReducer(s1, { type: 'toggleWarning', panelIndex: 2, warning: '注意跌倒' });
    expect(s2.panels).not.toBe(s1.panels);
    expect(s2.panels[1].requiredWarnings).toEqual(['注意跌倒']);
    expect(s1.panels[1].requiredWarnings).toEqual([]); // original panel untouched
  });

  it('toggles multi-select members on and off', () => {
    let s = emptyDraft();
    s = reviewDraftReducer(s, { type: 'toggleProblem', panelIndex: 1, problem: '有錯字' });
    s = reviewDraftReducer(s, { type: 'toggleProblem', panelIndex: 1, problem: '缺安全提醒' });
    expect(s.panels[0].problemTypes).toEqual(['有錯字', '缺安全提醒']);
    s = reviewDraftReducer(s, { type: 'toggleProblem', panelIndex: 1, problem: '有錯字' });
    expect(s.panels[0].problemTypes).toEqual(['缺安全提醒']);
  });

  it('keeps orphan free text but collapses empty string to null', () => {
    let s = emptyDraft();
    s = reviewDraftReducer(s, { type: 'problemNote', panelIndex: 3, value: '孤兒文字' });
    expect(s.panels[2].problemNote).toBe('孤兒文字'); // preserved without any problemType selected
    s = reviewDraftReducer(s, { type: 'problemNote', panelIndex: 3, value: '' });
    expect(s.panels[2].problemNote).toBeNull();
  });

  it('reviewToDraft projects a server review payload to the editable doc', () => {
    const review: ReviewState = {
      status: '草稿',
      overallJudgement: null,
      indicationJudgement: '有疑慮',
      indicationNote: '備註',
      panels: [
        { panelIndex: 1, requiredWarnings: ['骨鬆注意'], warningOther: null, problemTypes: [], problemNote: '看一下' },
        { panelIndex: 2, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null },
        { panelIndex: 3, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null },
        { panelIndex: 4, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null },
      ],
      createdAt: null,
      lastSavedAt: null,
      submittedAt: null,
      lastUpdatedAt: null,
    };
    const draft = reviewToDraft(review);
    expect(draft.indicationJudgement).toBe('有疑慮');
    expect(draft.panels[0].requiredWarnings).toEqual(['骨鬆注意']);
    expect(draft.panels[0].requiredWarnings).not.toBe(review.panels[0].requiredWarnings); // copied
  });
});
