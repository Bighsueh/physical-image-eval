/**
 * The per-panel submit gate (FR-049).
 *
 * A panel holds when the reviewer either signed it off (無問題) or left evidence of a problem.
 * As of the 2026-08-27 amendment there are **three** ways to leave that evidence, not two:
 * an annotation in the document, or **at least one reference photo on that panel**. A photo is
 * the reviewer saying「這個動作不對，正確的長這樣」— nothing more needs ticking.
 *
 * Kept pure and separate from the service so the rule can be unit-tested without a database,
 * and so the client can mirror it exactly from the photo list it already holds.
 */
export interface PanelGateInput {
  panelIndex: number;
  noProblem: boolean;
  requiredWarnings: readonly string[];
  warningOther: string | null;
  problemTypes: readonly string[];
  problemNote: string | null;
}

/** `photoCount` is the number of photos bound to THIS panel (image-level photos never count). */
export const isPanelAddressed = (panel: PanelGateInput, photoCount: number): boolean =>
  panel.noProblem ||
  photoCount > 0 ||
  panel.problemTypes.length > 0 ||
  panel.requiredWarnings.length > 0 ||
  Boolean(panel.problemNote?.trim()) ||
  Boolean(panel.warningOther?.trim());

/**
 * Panel indices that would block a submit, in ascending order.
 *
 * `photoCountsByPanel` MUST be read inside the same transaction as the submit: a reviewer can
 * upload a photo and submit before the 800 ms document debounce fires, so the document alone
 * says the panel is untouched while a photo for it is already persisted (research D15).
 */
export function unaddressedPanels(
  panels: readonly PanelGateInput[],
  photoCountsByPanel: ReadonlyMap<number, number>,
): number[] {
  return panels
    .filter((p) => !isPanelAddressed(p, photoCountsByPanel.get(p.panelIndex) ?? 0))
    .map((p) => p.panelIndex)
    .sort((a, b) => a - b);
}
