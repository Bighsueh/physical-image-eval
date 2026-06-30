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
 * mutates (rules: immutability). Free text '' collapses to null so an emptied field matches the
 * server's null; non-empty orphan text is preserved (FR-019).
 */
export type DraftAction =
  | { type: 'reset'; doc: ReviewDoc }
  | { type: 'overall'; value: OverallJudgement | null }
  | { type: 'indication'; value: IndicationJudgement | null }
  | { type: 'indicationNote'; value: string }
  | { type: 'toggleWarning'; panelIndex: number; warning: WarningType }
  | { type: 'warningOther'; panelIndex: number; value: string }
  | { type: 'toggleProblem'; panelIndex: number; problem: ProblemType }
  | { type: 'problemNote'; panelIndex: number; value: string };

const emptyToNull = (v: string): string | null => (v === '' ? null : v);

const toggle = <T>(arr: readonly T[], v: T): T[] =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

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
    case 'toggleWarning':
      return updatePanel(state, action.panelIndex, (p) => ({
        ...p,
        requiredWarnings: toggle(p.requiredWarnings, action.warning),
      }));
    case 'warningOther':
      return updatePanel(state, action.panelIndex, (p) => ({
        ...p,
        warningOther: emptyToNull(action.value),
      }));
    case 'toggleProblem':
      return updatePanel(state, action.panelIndex, (p) => ({
        ...p,
        problemTypes: toggle(p.problemTypes, action.problem),
      }));
    case 'problemNote':
      return updatePanel(state, action.panelIndex, (p) => ({
        ...p,
        problemNote: emptyToNull(action.value),
      }));
  }
};

export const emptyDraft = (): ReviewDoc => ({
  overallJudgement: null,
  indicationJudgement: null,
  indicationNote: null,
  panels: [1, 2, 3, 4].map((panelIndex) => ({
    panelIndex,
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
  panels: review.panels.map((p) => ({
    panelIndex: p.panelIndex,
    requiredWarnings: [...p.requiredWarnings],
    warningOther: p.warningOther,
    problemTypes: [...p.problemTypes],
    problemNote: p.problemNote,
  })),
});
