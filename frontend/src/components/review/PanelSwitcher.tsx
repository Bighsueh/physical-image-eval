import { useRef } from 'react';
import type { PanelDoc } from '../../api/reviews';
import { isPanelAddressed } from '../../state/reviewDraft';
import { PanelReviewForm, type PanelReviewHandlers } from './PanelReviewForm';

/** 圖N → its position in the 2×2 grid (matches the ①②③④ printed on the images, reading order). */
const POSITION: Record<number, string> = { 1: '左上', 2: '右上', 3: '左下', 4: '右下' };

/**
 * Collapses the four 圖1..圖4 forms behind a prominent accessible tab switcher (WAI-ARIA tabs):
 * one panel at a time, with each tab labelled by its image position, a status dot (已處理／需處理),
 * a 全部無問題 shortcut, and red highlighting of unaddressed panels after a blocked submit. Controlled
 * `active` so the page can jump to the first unaddressed panel.
 */
export function PanelSwitcher({
  panels,
  handlers,
  active,
  onActiveChange,
  invalidIndices = [],
  onAllNoProblem,
  photoCounts,
  renderPhotoSlot,
}: {
  panels: PanelDoc[];
  handlers: PanelReviewHandlers;
  active: number;
  onActiveChange: (panelIndex: number) => void;
  invalidIndices?: number[];
  onAllNoProblem: () => void;
  /** Photos per panel — drives the 📎 badge and the photo-aware addressed state (FR-049). */
  photoCounts?: (panelIndex: number) => number;
  /** Renders the 參考照片 block for the active panel. */
  renderPhotoSlot?: (panelIndex: number) => React.ReactNode;
}) {
  const tabRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const activePanel = panels.find((p) => p.panelIndex === active) ?? panels[0];

  const focusTab = (idx: number) => {
    onActiveChange(idx);
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
        <button type="button" onClick={onAllNoProblem} className="text-xs text-primary-deep hover:underline">
          全部標示無問題
        </button>
      </div>
      <p className="text-xs text-ink-soft">
        圖1～圖4 對應圖片的<strong className="text-ink">左上、右上、左下、右下</strong>四格。正在評：
        <strong className="text-primary-deep">
          圖 {active}（{POSITION[active]}）
        </strong>
      </p>

      <div role="tablist" aria-label="切換要審查的分格（圖1至圖4）" className="grid grid-cols-4 gap-2">
        {panels.map((p) => {
          const selected = p.panelIndex === active;
          const isInvalid = invalidIndices.includes(p.panelIndex);
          const photoCount = photoCounts?.(p.panelIndex) ?? 0;
          const addressed = isPanelAddressed(p, photoCount);
          const ring = isInvalid ? 'ring-1 ring-accent border-accent' : '';
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
              aria-controls={selected ? 'review-active-panel' : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onActiveChange(p.panelIndex)}
              onKeyDown={(e) => onKeyDown(e, p.panelIndex)}
              className={`relative min-h-[48px] rounded-xl border px-1 text-sm font-medium transition-colors ${ring} ${
                selected
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-surface text-ink hover:bg-surface-sunken'
              }`}
            >
              <span className="block">圖 {p.panelIndex}</span>
              <span className={`block text-[11px] font-normal ${selected ? 'text-white/80' : 'text-ink-soft'}`}>
                {POSITION[p.panelIndex]}
              </span>
              {photoCount > 0 && (
                <span
                  className={`absolute left-1.5 top-1 text-[10px] ${selected ? 'text-white/90' : 'text-ink-soft'}`}
                >
                  📎{photoCount}
                  <span className="sr-only">（已附 {photoCount} 張參考照片）</span>
                </span>
              )}
              {/* status dot: red = needs handling, green = handled */}
              {isInvalid ? (
                <span className="absolute right-1.5 top-1.5 inline-block h-2 w-2 rounded-full bg-accent">
                  <span className="sr-only">（需處理）</span>
                </span>
              ) : (
                addressed && (
                  <span
                    className={`absolute right-1.5 top-1.5 inline-block h-2 w-2 rounded-full ${
                      selected ? 'bg-white' : 'bg-primary'
                    }`}
                  >
                    <span className="sr-only">（已處理）</span>
                  </span>
                )
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="review-active-panel" aria-labelledby={`paneltab-${active}`} tabIndex={0}>
        <PanelReviewForm
          panel={activePanel}
          handlers={handlers}
          invalid={invalidIndices.includes(active)}
          photoSlot={renderPhotoSlot?.(active)}
          photoNudge={
            (photoCounts?.(active) ?? 0) > 0 && activePanel.problemTypes.length === 0
          }
        />
      </div>
    </div>
  );
}
