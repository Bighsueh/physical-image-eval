import { useRef, useState } from 'react';
import type { PanelDoc } from '../../api/reviews';
import { PanelReviewForm, type PanelReviewHandlers } from './PanelReviewForm';

/** A panel carries content if the reviewer marked anything on it (drives the "已填" indicator). */
const hasContent = (p: PanelDoc): boolean =>
  p.requiredWarnings.length > 0 || !!p.warningOther || p.problemTypes.length > 0 || !!p.problemNote;

/**
 * Collapses the four 圖1..圖4 forms behind a prominent accessible tab switcher, so the reviewer
 * always sees exactly one panel and knows which one they're evaluating (FR-013). Tabs show a "已填"
 * dot for panels with content; arrow keys move between tabs (WAI-ARIA tabs pattern).
 */
export function PanelSwitcher({
  panels,
  handlers,
}: {
  panels: PanelDoc[];
  handlers: PanelReviewHandlers;
}) {
  const [active, setActive] = useState(1);
  const tabRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const activePanel = panels.find((p) => p.panelIndex === active) ?? panels[0];

  const focusTab = (idx: number) => {
    setActive(idx);
    tabRefs.current[idx]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusTab(idx === 4 ? 1 : idx + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusTab(idx === 1 ? 4 : idx - 1);
    }
  };

  return (
    <div data-tour="panel-switcher" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">分格審查</h3>
        <p className="text-sm text-ink-soft">
          正在評：<strong className="text-primary-deep">圖 {active}</strong>
        </p>
      </div>

      <div role="tablist" aria-label="切換要審查的分格（圖1至圖4）" className="grid grid-cols-4 gap-2">
        {panels.map((p) => {
          const selected = p.panelIndex === active;
          const filled = hasContent(p);
          return (
            <button
              key={p.panelIndex}
              ref={(el) => {
                tabRefs.current[p.panelIndex] = el;
              }}
              type="button"
              role="tab"
              id={`paneltab-${p.panelIndex}`}
              aria-selected={selected}
              // Only the selected tab controls the single rendered panel (no dangling IDREFs).
              aria-controls={selected ? 'review-active-panel' : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(p.panelIndex)}
              onKeyDown={(e) => onKeyDown(e, p.panelIndex)}
              className={`relative min-h-[44px] rounded-xl border text-sm font-medium transition-colors ${
                selected
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-surface text-ink hover:bg-surface-sunken'
              }`}
            >
              圖 {p.panelIndex}
              {filled && (
                <span
                  className={`absolute right-1.5 top-1.5 inline-block h-2 w-2 rounded-full ${
                    selected ? 'bg-white' : 'bg-primary'
                  }`}
                >
                  <span className="sr-only">（已填寫）</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="review-active-panel"
        aria-labelledby={`paneltab-${active}`}
        tabIndex={0}
      >
        <PanelReviewForm panel={activePanel} handlers={handlers} />
      </div>
    </div>
  );
}
