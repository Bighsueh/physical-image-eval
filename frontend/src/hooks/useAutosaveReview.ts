import { useCallback, useEffect, useRef, useState } from 'react';
import { autosaveReview, type ReviewDoc, type SaveData } from '../api/reviews';
import type { SaveState } from '../components/review/SubmitBar';

export interface AutosaveController {
  saveState: SaveState;
  /**
   * Cancel any queued (not-yet-sent) autosave and resolve once the in-flight one (if any) settles.
   * Call this BEFORE a destructive action (reset) so no autosave can land after it — otherwise a
   * late PATCH's upsert resurrects the row the reset just deleted.
   */
  flush: () => Promise<void>;
  /** Skip exactly one upcoming autosave (the programmatic draft change made by a reset). */
  skipNext: () => void;
}

/**
 * Debounced full-document autosave (FR-022). Structurally PATCH-only — it never calls submit, so it
 * can never elevate 草稿→已提交. The first run (the just-loaded draft) is skipped so opening a
 * blueprint doesn't immediately write.
 *
 * `onSaved(doc, res)` fires after each successful write with the exact document persisted and the
 * server's save summary, so the caller can keep the cached review in sync (otherwise a quick
 * re-entry re-hydrates from a stale cache and the draft appears to have vanished).
 */
export function useAutosaveReview(
  blueprintId: string,
  draft: ReviewDoc,
  onSaved?: (doc: ReviewDoc, res: SaveData) => void,
  delay = 800,
): AutosaveController {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const firstRun = useRef(true);
  const skipRef = useRef(false); // skip the next autosave (a reset's programmatic blanking)
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const inFlightRef = useRef<Promise<void> | null>(null); // the currently-sending PATCH, if any
  // Keep the latest onSaved without making it an effect dependency (would re-arm the debounce).
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (skipRef.current) {
      skipRef.current = false; // this draft change was a reset — don't persist it
      return;
    }
    setSaveState('saving');
    timerRef.current = setTimeout(() => {
      const p = autosaveReview(blueprintId, draft)
        .then((res) => {
          setSaveState('saved');
          onSavedRef.current?.(draft, res);
        })
        .catch(() => setSaveState('error')) // surface failure (don't silently revert to idle)
        .finally(() => {
          if (inFlightRef.current === p) inFlightRef.current = null;
        });
      inFlightRef.current = p;
    }, delay);
    return () => clearTimeout(timerRef.current);
  }, [draft, blueprintId, delay]);

  const flush = useCallback(() => {
    clearTimeout(timerRef.current); // drop any queued autosave (we're about to discard the draft)
    return inFlightRef.current ?? Promise.resolve();
  }, []);

  const skipNext = useCallback(() => {
    skipRef.current = true;
  }, []);

  return { saveState, flush, skipNext };
}
