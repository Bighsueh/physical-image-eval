import { useEffect, useRef, useState } from 'react';
import { autosaveReview, type ReviewDoc } from '../api/reviews';
import type { SaveState } from '../components/review/SubmitBar';

/**
 * Debounced full-document autosave (FR-022). Structurally PATCH-only — it never calls submit, so it
 * can never elevate 草稿→已提交. The first run (the just-loaded draft) is skipped so opening a
 * blueprint doesn't immediately write. Mount this inside a component keyed by blueprintId.
 */
export function useAutosaveReview(blueprintId: string, draft: ReviewDoc, delay = 800): SaveState {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveState('saving');
    const handle = setTimeout(() => {
      autosaveReview(blueprintId, draft)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('idle'));
    }, delay);
    return () => clearTimeout(handle);
  }, [draft, blueprintId, delay]);

  return saveState;
}
