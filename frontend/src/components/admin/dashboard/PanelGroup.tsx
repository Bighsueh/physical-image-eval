import { AlertTriangle, CheckCircle2, Paperclip } from 'lucide-react';
import type { WorkTablePanel } from '../../../api/admin-dashboard';
import { ReviewerEntryRow } from './ReviewerEntry';

/** 圖N → its position in the 2×2 grid, matching the numbers printed on the images. */
const POSITION: Record<number, string> = { 1: '左上', 2: '右上', 3: '左下', 4: '右下' };

/**
 * One panel of the work table. Panels every submitting reviewer signed off collapse to a single
 * line — with 51 images to work through, the ones that need nothing must not cost any reading.
 *
 * State is conveyed by icon + text, never colour alone (constitution IX).
 */
export function PanelGroup({ panel }: { panel: WorkTablePanel }) {
  const header = (
    <div
      className={`flex items-center justify-between gap-2.5 px-3 py-2 text-sm font-medium flex-wrap ${
        panel.allClear
          ? 'bg-primary-tint text-primary-deep'
          : panel.flaggedReviewerCount > 0
            ? 'bg-accent-tint text-accent-deep border-b border-border'
            : 'bg-surface-sunken text-ink-soft border-b border-border'
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {panel.allClear ? (
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        ) : panel.flaggedReviewerCount > 0 ? (
          <AlertTriangle className="w-4 h-4" aria-hidden="true" />
        ) : null}
        圖{panel.panelIndex}（{POSITION[panel.panelIndex]}）
        {panel.stepName && <span className="font-normal">· {panel.stepName}</span>}
      </span>
      <span className="inline-flex items-center gap-2 text-xs">
        {panel.allClear ? (
          <span>全員無問題</span>
        ) : panel.flaggedReviewerCount > 0 ? (
          <span className="nums">{panel.flaggedReviewerCount} 位標了問題</span>
        ) : (
          <span>尚無提交</span>
        )}
        {panel.photoCount > 0 && (
          <span className="inline-flex items-center gap-0.5 nums">
            <Paperclip className="w-3 h-3" aria-hidden="true" />
            {panel.photoCount}
            <span className="sr-only">張參考照片</span>
          </span>
        )}
      </span>
    </div>
  );

  return (
    <section className="rounded-xl border border-border bg-surface overflow-hidden">
      {header}
      {!panel.allClear &&
        panel.entries.map((entry) => (
          <ReviewerEntryRow key={`${entry.reviewerDisplayName}-${panel.panelIndex}`} entry={entry} />
        ))}
    </section>
  );
}
