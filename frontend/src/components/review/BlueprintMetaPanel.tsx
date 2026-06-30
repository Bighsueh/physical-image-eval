import { ChevronRight, ClipboardList, Lightbulb, Repeat } from 'lucide-react';
import type { ReviewBlueprint } from '../../api/reviews';

/** Read-only blueprint plan text (FR-007). Prominent labelled fields + a collapsed storyboard the
 * reviewer can open when needed. NEVER renders aiPrompt (not in the payload — FR-009). */
export function BlueprintMetaPanel({ blueprint }: { blueprint: ReviewBlueprint }) {
  const Field = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: typeof ClipboardList;
    label: string;
    value: string;
  }) => (
    <div>
      <dt className="flex items-center gap-1.5 text-sm font-semibold text-primary-deep">
        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 pl-6 text-sm text-ink whitespace-pre-wrap leading-relaxed">{value}</dd>
    </div>
  );

  return (
    <div className="space-y-4">
      <dl className="space-y-4">
        <Field icon={ClipboardList} label="適應症" value={blueprint.indications} />
        <Field icon={Repeat} label="練習次數" value={blueprint.frequency} />
        <Field icon={Lightbulb} label="溫馨小叮嚀" value={blueprint.gentleReminder} />
      </dl>

      {/* Storyboard collapsed by default — open when you need per-panel detail (native, keyboard-ok). */}
      <details data-tour="storyboard" className="group rounded-xl border border-border bg-surface-sunken/40">
        <summary className="flex items-center gap-1.5 cursor-pointer select-none px-3 py-2.5 text-sm font-semibold text-primary-deep hover:bg-surface-sunken/70 rounded-xl">
          <ChevronRight
            className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          四宮格分鏡細節
          <span className="ml-1 font-normal text-ink-soft">— 需要時點開查看每格步驟／動作／秒數／畫面</span>
        </summary>
        <div className="space-y-2 px-3 pb-3">
          {blueprint.panels.map((p) => (
            <div key={p.panelIndex} className="rounded-xl border border-border bg-surface p-2.5 text-sm">
              <p className="font-medium text-ink">
                圖 {p.panelIndex}・{p.stepName}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-ink">{p.actionDescription}</p>
              {p.timingHint && <p className="mt-1 text-xs text-ink-soft">⏱ {p.timingHint}</p>}
              {p.visualDescription && (
                <p className="mt-1 text-xs text-ink-soft">畫面：{p.visualDescription}</p>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
