import type { ReviewBlueprint } from '../../api/reviews';

/** Read-only blueprint plan text (FR-007). Shows 適應症/練習次數/溫馨小叮嚀 + each panel's
 * 步驟名/動作說明/時間提示/畫面視覺描述. NEVER renders aiPrompt (not in the payload — FR-009). */
export function BlueprintMetaPanel({ blueprint }: { blueprint: ReviewBlueprint }) {
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div>
      <dt className="text-xs font-medium text-ink-soft">{label}</dt>
      <dd className="text-sm text-ink whitespace-pre-wrap">{value}</dd>
    </div>
  );

  return (
    <div className="space-y-4">
      <dl className="space-y-3">
        <Row label="適應症" value={blueprint.indications} />
        <Row label="練習次數" value={blueprint.frequency} />
        <Row label="溫馨小叮嚀" value={blueprint.gentleReminder} />
      </dl>

      <div>
        <h3 className="text-sm font-semibold text-primary-deep mb-2">四宮格分鏡（唯讀）</h3>
        <div className="space-y-2">
          {blueprint.panels.map((p) => (
            <div key={p.panelIndex} className="rounded-xl border border-border bg-surface p-2.5 text-sm">
              <p className="font-medium text-ink">
                圖 {p.panelIndex}・{p.stepName}
              </p>
              <p className="text-ink whitespace-pre-wrap mt-0.5">{p.actionDescription}</p>
              {p.timingHint && <p className="text-ink-soft text-xs mt-1">⏱ {p.timingHint}</p>}
              {p.visualDescription && (
                <p className="text-ink-soft text-xs mt-1">畫面：{p.visualDescription}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
