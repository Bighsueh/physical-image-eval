/** Test helpers for review documents (the wire body shape — zh-TW enum values). */
export interface WirePanel {
  panelIndex: number;
  noProblem?: boolean;
  requiredWarnings?: string[];
  warningOther?: string | null;
  problemTypes?: string[];
  problemNote?: string | null;
}
export interface WireDoc {
  overallJudgement?: string | null;
  indicationJudgement?: string | null;
  indicationNote?: string | null;
  otherComment?: string | null;
  panels: WirePanel[];
}

export const emptyPanels = (): WirePanel[] =>
  [1, 2, 3, 4].map((panelIndex) => ({
    panelIndex,
    noProblem: false,
    requiredWarnings: [],
    warningOther: null,
    problemTypes: [],
    problemNote: null,
  }));

export const emptyDoc = (over: Partial<WireDoc> = {}): WireDoc => ({
  overallJudgement: null,
  indicationJudgement: null,
  indicationNote: null,
  otherComment: null,
  panels: emptyPanels(),
  ...over,
});

/** A submittable clean doc: every panel explicitly signed off as 無問題 (passes the submit gate). */
export const cleanDoc = (over: Partial<WireDoc> = {}): WireDoc =>
  emptyDoc({ ...over, panels: emptyPanels().map((p) => ({ ...p, noProblem: true })) });

/** Replace one panel in an otherwise-empty doc. */
export const docWithPanel = (panelIndex: number, panel: Partial<WirePanel>, over: Partial<WireDoc> = {}): WireDoc => {
  const panels = emptyPanels().map((p) => (p.panelIndex === panelIndex ? { ...p, ...panel } : p));
  return emptyDoc({ ...over, panels });
};
