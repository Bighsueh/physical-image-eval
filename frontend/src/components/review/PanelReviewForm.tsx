import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  PROBLEM_OPTIONS,
  WARNING_OPTIONS,
  type PanelDoc,
  type ProblemType,
  type WarningType,
} from '../../api/reviews';

/** Accessible multi-select as a checkbox group (empty set valid — FR-014/016). */
function CheckGroup<T extends string>({
  legend,
  options,
  selected,
  onToggle,
  name,
}: {
  legend: string;
  options: readonly T[];
  selected: readonly T[];
  onToggle: (v: T) => void;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-medium text-ink-soft mb-1.5">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const checked = selected.includes(opt);
          return (
            <label
              key={opt}
              className={`inline-flex items-center gap-1.5 cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors ${
                checked
                  ? 'bg-primary-tint border-primary text-primary-deep font-medium'
                  : 'bg-surface border-border text-ink hover:bg-surface-sunken'
              }`}
            >
              <input
                type="checkbox"
                name={name}
                checked={checked}
                onChange={() => onToggle(opt)}
                className="accent-primary"
              />
              {checked ? '✓ ' : ''}
              {opt}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface PanelReviewHandlers {
  onToggleNoProblem: (panelIndex: number) => void;
  onToggleWarning: (panelIndex: number, w: WarningType) => void;
  onWarningOther: (panelIndex: number, v: string) => void;
  onToggleProblem: (panelIndex: number, p: ProblemType) => void;
  onProblemNote: (panelIndex: number, v: string) => void;
}

/** Per-panel review (圖N). Reviewer either marks 無問題 (signs off) OR records an annotation; submit
 * requires one or the other (`invalid` highlights an unaddressed panel after a blocked submit). */
export function PanelReviewForm({
  panel,
  handlers,
  invalid = false,
  photoSlot,
  photoNudge = false,
}: {
  panel: PanelDoc;
  handlers: PanelReviewHandlers;
  invalid?: boolean;
  /** The 參考照片 block for this panel; injected so this form stays presentational. */
  photoSlot?: React.ReactNode;
  /** Shown when a photo is attached but no problem type is ticked — encouragement, not a gate. */
  photoNudge?: boolean;
}) {
  const i = panel.panelIndex;
  const textBox =
    'mt-1 w-full rounded-xl border border-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary';
  return (
    <div
      className={`rounded-xl border bg-surface-sunken/40 p-3 space-y-3 ${
        invalid ? 'border-accent ring-1 ring-accent' : 'border-border'
      }`}
    >
      {/* Explicit sign-off — 無問題 OR annotate below. */}
      <label
        className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
          panel.noProblem
            ? 'border-primary bg-primary-tint text-primary-deep font-medium'
            : 'border-border bg-surface hover:bg-surface-sunken'
        }`}
      >
        <input
          type="checkbox"
          checked={panel.noProblem}
          onChange={() => handlers.onToggleNoProblem(i)}
          className="accent-primary"
        />
        {panel.noProblem && <CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
        此分格無問題
      </label>

      {invalid && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-accent-deep">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          請勾選「此分格無問題」，或在下方標注問題。
        </p>
      )}

      {!panel.noProblem && (
        <>
          <CheckGroup
            legend="需要添加的警語"
            name={`warn-${i}`}
            options={WARNING_OPTIONS}
            selected={panel.requiredWarnings}
            onToggle={(w) => handlers.onToggleWarning(i, w)}
          />
          <div>
            <label htmlFor={`warnOther-${i}`} className="text-xs font-medium text-ink-soft">
              警語－其它（選填）
            </label>
            <input
              id={`warnOther-${i}`}
              value={panel.warningOther ?? ''}
              onChange={(e) => handlers.onWarningOther(i, e.target.value)}
              className={textBox}
            />
          </div>

          <CheckGroup
            legend="問題類型"
            name={`prob-${i}`}
            options={PROBLEM_OPTIONS}
            selected={panel.problemTypes}
            onToggle={(p) => handlers.onToggleProblem(i, p)}
          />
          <div>
            <label htmlFor={`probNote-${i}`} className="text-xs font-medium text-ink-soft">
              問題說明（選填）
            </label>
            <textarea
              id={`probNote-${i}`}
              value={panel.problemNote ?? ''}
              onChange={(e) => handlers.onProblemNote(i, e.target.value)}
              rows={2}
              className={textBox}
            />
          </div>

          {photoSlot && <div className="pt-1">{photoSlot}</div>}

          {photoNudge && (
            <p className="flex items-start gap-1.5 rounded-xl border border-warn bg-warn-tint px-2.5 py-1.5 text-xs text-warn-deep">
              <span aria-hidden="true">💡</span>
              <span>
                已附參考照片，這一格視為<strong>已標注問題</strong>、可以提交。建議一併勾選「動作示範錯誤」，之後統計比較好抓。
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
