import { AlertTriangle, Check } from 'lucide-react';
import type { ReviewDoc } from '../../api/reviews';
import { Button } from '../ui';

export const OVERALL_ERROR_ID = 'overall-judgement-error';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const allPanelsEmpty = (doc: ReviewDoc): boolean =>
  doc.panels.every(
    (p) => p.requiredWarnings.length === 0 && !p.warningOther && p.problemTypes.length === 0 && !p.problemNote,
  );

/**
 * Submit control. The inline 請先選擇整體判定 block (FR-011) is validated in the page (shared by the
 * button and the keyboard path) and passed in via `error`. Shows a NON-blocking soft prompt for
 * 需小修／需重做 + all-empty panels (FR-030). Surfaces the autosave state (FR-022).
 */
export function SubmitBar({
  doc,
  saveState,
  submitting,
  isResubmit,
  error,
  onSubmit,
}: {
  doc: ReviewDoc;
  saveState: SaveState;
  submitting: boolean;
  isResubmit: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const softPrompt =
    (doc.overallJudgement === '需小修' || doc.overallJudgement === '需重做') && allPanelsEmpty(doc);

  return (
    <div className="sticky bottom-0 -mx-6 mt-6 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
      {error && (
        <p id={OVERALL_ERROR_ID} role="alert" className="mb-2 flex items-center gap-1.5 text-sm text-accent-deep">
          <AlertTriangle className="w-4 h-4" aria-hidden="true" />
          {error}
        </p>
      )}
      {softPrompt && (
        <p role="note" className="mb-2 flex items-center gap-1.5 text-sm text-warn-deep">
          <AlertTriangle className="w-4 h-4" aria-hidden="true" />
          判定為「{doc.overallJudgement}」，建議至少補一處問題說明（仍可直接提交）。
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-ink-soft" aria-live="polite">
          {saveState === 'saving' && '草稿儲存中…'}
          {saveState === 'saved' && (
            <span className="inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              草稿已儲存
            </span>
          )}
          {saveState === 'error' && (
            <span className="inline-flex items-center gap-1 text-accent-deep">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              草稿儲存失敗，請檢查連線
            </span>
          )}
        </span>
        <Button onClick={onSubmit} loading={submitting}>
          {submitting ? '提交中…' : isResubmit ? '再次提交並前往下一張' : '提交並前往下一張'}
        </Button>
      </div>
    </div>
  );
}
