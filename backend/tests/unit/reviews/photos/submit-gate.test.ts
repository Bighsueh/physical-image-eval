import { describe, expect, it } from 'vitest';
import {
  isPanelAddressed,
  unaddressedPanels,
  type PanelGateInput,
} from '../../../../src/reviews/services/panel-gate';

const blank = (panelIndex: number): PanelGateInput => ({
  panelIndex,
  noProblem: false,
  requiredWarnings: [],
  warningOther: null,
  problemTypes: [],
  problemNote: null,
});

const allBlank = () => [1, 2, 3, 4].map(blank);

describe('isPanelAddressed — the three ways a panel can hold (FR-049)', () => {
  it('holds when the reviewer signed off 無問題', () => {
    expect(isPanelAddressed({ ...blank(1), noProblem: true }, 0)).toBe(true);
  });

  it('holds when the document carries any annotation', () => {
    expect(isPanelAddressed({ ...blank(1), problemTypes: ['WRONG_DEMONSTRATION'] }, 0)).toBe(true);
    expect(isPanelAddressed({ ...blank(1), requiredWarnings: ['FALL_RISK'] }, 0)).toBe(true);
    expect(isPanelAddressed({ ...blank(1), problemNote: '拇指位置不對' }, 0)).toBe(true);
    expect(isPanelAddressed({ ...blank(1), warningOther: '需兩人協助' }, 0)).toBe(true);
  });

  it('holds on a photo alone — the reviewer photographed the correct movement and ticked nothing', () => {
    expect(isPanelAddressed(blank(1), 1)).toBe(true);
    expect(isPanelAddressed(blank(1), 3)).toBe(true);
  });

  it('does not hold when there is neither a sign-off, an annotation, nor a photo', () => {
    expect(isPanelAddressed(blank(1), 0)).toBe(false);
  });

  it('treats whitespace-only free text as no annotation', () => {
    expect(isPanelAddressed({ ...blank(1), problemNote: '   ' }, 0)).toBe(false);
    expect(isPanelAddressed({ ...blank(1), warningOther: '\n\t' }, 0)).toBe(false);
  });
});

describe('unaddressedPanels — which panels block a submit', () => {
  it('returns every panel when nothing has been done', () => {
    expect(unaddressedPanels(allBlank(), new Map())).toEqual([1, 2, 3, 4]);
  });

  it('excludes a panel whose only evidence is a photo (the race this exists for)', () => {
    // 圖2 has a photo persisted by its own endpoint, but the debounced document PATCH has not
    // landed, so the submitted document still shows it blank. The gate must not block.
    const counts = new Map([[2, 1]]);
    expect(unaddressedPanels(allBlank(), counts)).toEqual([1, 3, 4]);
  });

  it('counts image-level photos (panelIndex null) for no panel', () => {
    const counts = new Map([[null as unknown as number, 5]]);
    expect(unaddressedPanels(allBlank(), counts)).toEqual([1, 2, 3, 4]);
  });

  it('returns empty when every panel holds by some combination', () => {
    const panels = [
      { ...blank(1), noProblem: true },
      { ...blank(2), problemTypes: ['TYPO' as const] },
      blank(3), // photo below
      { ...blank(4), problemNote: '次數過多' },
    ];
    expect(unaddressedPanels(panels, new Map([[3, 2]]))).toEqual([]);
  });
});
