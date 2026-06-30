import type {
  IndicationJudgement,
  OverallJudgement,
  PanelDoc,
  ProblemType,
  ReviewDoc,
  ReviewState,
  WarningType,
} from '../api/reviews';

/**
 * Immutable reducer for the in-progress review draft. EVERY action returns a NEW ReviewDoc — never
 * mutates (rules: immutability). Free text '' collapses to null. Per-panel 無問題 and annotations are
 * mutually consistent: marking 無問題 clears that panel's annotations; adding any annotation clears
 * 無問題.
 */
export type DraftAction =
  | { type: 'reset'; doc: ReviewDoc }
  | { type: 'overall'; value: OverallJudgement | null }
  | { type: 'indication'; value: IndicationJudgement | null }
  | { type: 'indicationNote'; value: string }
  | { type: 'otherComment'; value: string }
  | { type: 'toggleNoProblem'; panelIndex: number }
  | { type: 'allNoProblem' }
  | { type: 'toggleWarning'; panelIndex: number; warning: WarningType }
  | { type: 'warningOther'; panelIndex: number; value: string }
  | { type: 'toggleProblem'; panelIndex: number; problem: ProblemType }
  | { type: 'problemNote'; panelIndex: number; value: string };

const emptyToNull = (v: string): string | null => (v === '' ? null : v);

const toggle = <T>(arr: readonly T[], v: T): T[] =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

const clearAnnotations = (p: PanelDoc): PanelDoc => ({
  ...p,
  requiredWarnings: [],
  warningOther: null,
  problemTypes: [],
  problemNote: null,
});

const noProblemOn = (p: PanelDoc): PanelDoc => ({ ...clearAnnotations(p), noProblem: true });

const updatePanel = (
  doc: ReviewDoc,
  panelIndex: number,
  fn: (p: PanelDoc) => PanelDoc,
): ReviewDoc => ({
  ...doc,
  panels: doc.panels.map((p) => (p.panelIndex === panelIndex ? fn(p) : p)),
});

export const reviewDraftReducer = (state: ReviewDoc, action: DraftAction): ReviewDoc => {
  switch (action.type) {
    case 'reset':
      return action.doc;
    case 'overall':
      return { ...state, overallJudgement: action.value };
    case 'indication':
      return { ...state, indicationJudgement: action.value };
    case 'indicationNote':
      return { ...state, indicationNote: emptyToNull(action.value) };
    case 'otherComment':
      return { ...state, otherComment: emptyToNull(action.value) };
    case 'allNoProblem':
      return { ...state, panels: state.panels.map(noProblemOn) };
    case 'toggleNoProblem':
      return updatePanel(state, action.panelIndex, (p) =>
        p.noProblem ? { ...p, noProblem: false } : noProblemOn(p),
      );
    // Any annotation implies there IS a problem → clears the 無問題 flag for that panel.
    case 'toggleWarning':
      return updatePanel(state, action.panelIndex, (p) => ({
        ...p,
        noProblem: false,
        requiredWarnings: toggle(p.requiredWarnings, action.warning),
      }));
    case 'warningOther':
      return updatePanel(state, action.panelIndex, (p) => ({
        ...p,
        noProblem: false,
        warningOther: emptyToNull(action.value),
      }));
    case 'toggleProblem':
      return updatePanel(state, action.panelIndex, (p) => ({
        ...p,
        noProblem: false,
        problemTypes: toggle(p.problemTypes, action.problem),
      }));
    case 'problemNote':
      return updatePanel(state, action.panelIndex, (p) => ({
        ...p,
        noProblem: false,
        problemNote: emptyToNull(action.value),
      }));
  }
};

export const emptyDraft = (): ReviewDoc => ({
  overallJudgement: null,
  indicationJudgement: null,
  indicationNote: null,
  otherComment: null,
  panels: [1, 2, 3, 4].map((panelIndex) => ({
    panelIndex,
    noProblem: false,
    requiredWarnings: [],
    warningOther: null,
    problemTypes: [],
    problemNote: null,
  })),
});

/** Project the server review payload down to the editable draft document. */
export const reviewToDraft = (review: ReviewState): ReviewDoc => ({
  overallJudgement: review.overallJudgement,
  indicationJudgement: review.indicationJudgement,
  indicationNote: review.indicationNote,
  otherComment: review.otherComment,
  panels: review.panels.map((p) => ({
    panelIndex: p.panelIndex,
    noProblem: p.noProblem,
    requiredWarnings: [...p.requiredWarnings],
    warningOther: p.warningOther,
    problemTypes: [...p.problemTypes],
    problemNote: p.problemNote,
  })),
});

/** A panel is "addressed" for submit iff explicitly 無問題 OR it carries any annotation. */
export const isPanelAddressed = (p: PanelDoc): boolean =>
  p.noProblem ||
  p.requiredWarnings.length > 0 ||
  p.problemTypes.length > 0 ||
  Boolean(p.warningOther && p.warningOther.trim()) ||
  Boolean(p.problemNote && p.problemNote.trim());
