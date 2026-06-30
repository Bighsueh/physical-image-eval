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
  onToggleWarning: (panelIndex: number, w: WarningType) => void;
  onWarningOther: (panelIndex: number, v: string) => void;
  onToggleProblem: (panelIndex: number, p: ProblemType) => void;
  onProblemNote: (panelIndex: number, v: string) => void;
}

/** Per-panel review (圖N) — warnings (multi) + 其它 text + problem types (multi) + note. All optional. */
export function PanelReviewForm({ panel, handlers }: { panel: PanelDoc; handlers: PanelReviewHandlers }) {
  const i = panel.panelIndex;
  const textBox =
    'mt-1 w-full rounded-xl border border-border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary';
  return (
    <div className="rounded-xl border border-border bg-surface-sunken/40 p-3 space-y-3">
      <h4 className="text-sm font-semibold text-primary-deep">圖 {i}</h4>

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
    </div>
  );
}
