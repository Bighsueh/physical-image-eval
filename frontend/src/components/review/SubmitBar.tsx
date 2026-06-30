import { AlertTriangle, Check } from 'lucide-react';
import { Button } from '../ui';

export const OVERALL_ERROR_ID = 'overall-judgement-error';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Submit control. The inline error (請先選擇整體判定 / per-panel gate) is validated in the page and
 * passed in via `error`. Surfaces the autosave state (FR-022).
 */
export function SubmitBar({
  saveState,
  submitting,
  isResubmit,
  error,
  onSubmit,
}: {
  saveState: SaveState;
  submitting: boolean;
  isResubmit: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="sticky bottom-0 -mx-6 mt-6 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
      {error && (
        <p id={OVERALL_ERROR_ID} role="alert" className="mb-2 flex items-center gap-1.5 text-sm text-accent-deep">
          <AlertTriangle className="w-4 h-4" aria-hidden="true" />
          {error}
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
