import { describe, expect, it } from 'vitest';
import type { ReviewState } from '../../src/api/reviews';
import {
  emptyDraft,
  isPanelAddressed,
  reviewDraftReducer,
  reviewToDraft,
} from '../../src/state/reviewDraft';

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

  it('keeps orphan free text but collapses empty string to null; sets otherComment', () => {
    let s = emptyDraft();
    s = reviewDraftReducer(s, { type: 'problemNote', panelIndex: 3, value: '孤兒文字' });
    expect(s.panels[2].problemNote).toBe('孤兒文字'); // preserved without any problemType selected
    s = reviewDraftReducer(s, { type: 'problemNote', panelIndex: 3, value: '' });
    expect(s.panels[2].problemNote).toBeNull();
    s = reviewDraftReducer(s, { type: 'otherComment', value: '整體補充' });
    expect(s.otherComment).toBe('整體補充');
  });

  it('無問題 and annotations are mutually exclusive', () => {
    let s = emptyDraft();
    // mark 無問題 → addressed; adding a problem clears 無問題
    s = reviewDraftReducer(s, { type: 'toggleNoProblem', panelIndex: 1 });
    expect(s.panels[0].noProblem).toBe(true);
    expect(isPanelAddressed(s.panels[0])).toBe(true);
    s = reviewDraftReducer(s, { type: 'toggleProblem', panelIndex: 1, problem: '有錯字' });
    expect(s.panels[0].noProblem).toBe(false);
    expect(s.panels[0].problemTypes).toEqual(['有錯字']);
    // marking 無問題 again clears the annotation
    s = reviewDraftReducer(s, { type: 'toggleNoProblem', panelIndex: 1 });
    expect(s.panels[0].noProblem).toBe(true);
    expect(s.panels[0].problemTypes).toEqual([]);
  });

  it('allNoProblem marks every panel addressed; isPanelAddressed reflects emptiness', () => {
    const empty = emptyDraft();
    expect(empty.panels.every(isPanelAddressed)).toBe(false); // nothing addressed yet
    const all = reviewDraftReducer(empty, { type: 'allNoProblem' });
    expect(all.panels.every((p) => p.noProblem)).toBe(true);
    expect(all.panels.every(isPanelAddressed)).toBe(true);
  });

  it('reviewToDraft projects a server review payload to the editable doc', () => {
    const review: ReviewState = {
      status: '草稿',
      overallJudgement: null,
      indicationJudgement: '有疑慮',
      indicationNote: '備註',
      otherComment: '其他',
      panels: [
        { panelIndex: 1, noProblem: false, requiredWarnings: ['骨鬆注意'], warningOther: null, problemTypes: [], problemNote: '看一下' },
        { panelIndex: 2, noProblem: true, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null },
        { panelIndex: 3, noProblem: false, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null },
        { panelIndex: 4, noProblem: false, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null },
      ],
      createdAt: null,
      lastSavedAt: null,
      submittedAt: null,
      lastUpdatedAt: null,
    };
    const draft = reviewToDraft(review);
    expect(draft.indicationJudgement).toBe('有疑慮');
    expect(draft.otherComment).toBe('其他');
    expect(draft.panels[1].noProblem).toBe(true);
    expect(draft.panels[0].requiredWarnings).toEqual(['骨鬆注意']);
    expect(draft.panels[0].requiredWarnings).not.toBe(review.panels[0].requiredWarnings); // copied
  });
});
