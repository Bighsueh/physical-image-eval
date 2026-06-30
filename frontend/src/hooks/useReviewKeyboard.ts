import { useEffect } from 'react';
import type { OverallJudgement } from '../api/reviews';

const isTyping = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null;
  const tag = node?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node?.isContentEditable === true;
};

const KEY_TO_JUDGE: Record<string, OverallJudgement> = { '1': '通過', '2': '需小修', '3': '需重做' };

/**
 * Keyboard fast-path for the single-image review (FR-037/038, SC-011). Outside text fields, 1/2/3
 * set 整體判定; Cmd/Ctrl+Enter submits from anywhere. Keeps the clean-image path mouse-free.
 */
export function useReviewKeyboard({
  onJudge,
  onSubmit,
}: {
  onJudge: (v: OverallJudgement) => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const judge = KEY_TO_JUDGE[e.key];
      if (judge) {
        e.preventDefault();
        onJudge(judge);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onJudge, onSubmit]);
}
