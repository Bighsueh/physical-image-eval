import { useEffect, useRef, useState } from 'react';
import { autosaveReview, type ReviewDoc, type SaveData } from '../api/reviews';
import type { SaveState } from '../components/review/SubmitBar';

/**
 * Debounced full-document autosave (FR-022). Structurally PATCH-only — it never calls submit, so it
 * can never elevate 草稿→已提交. The first run (the just-loaded draft) is skipped so opening a
 * blueprint doesn't immediately write. Mount this inside a component keyed by blueprintId.
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
): SaveState {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const firstRun = useRef(true);
  // Keep the latest onSaved without making it an effect dependency (would re-arm the debounce).
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState('saving');
    const handle = setTimeout(() => {
      autosaveReview(blueprintId, draft)
        .then((res) => {
          setSaveState('saved');
          onSavedRef.current?.(draft, res);
        })
        .catch(() => setSaveState('error')); // surface failure (don't silently revert to idle)
    }, delay);
    return () => clearTimeout(handle);
  }, [draft, blueprintId, delay]);

  return saveState;
}
