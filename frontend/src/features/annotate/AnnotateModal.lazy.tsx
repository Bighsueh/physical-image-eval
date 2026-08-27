import { lazy, Suspense } from 'react';
import type { ReviewPhoto } from '../../api/review-photos';

/**
 * Dynamic-import boundary for the image editor.
 *
 * The editor is a Konva-based component and is by far the heaviest thing in this app. Most
 * reviewers never annotate, so it must not be in the bundle they download to open a review —
 * it is fetched the first time someone presses 「標註」 and never before (research D17).
 */
const AnnotateEditor = lazy(() =>
  import('./AnnotateEditor').then((m) => ({ default: m.AnnotateEditor })),
);

export interface AnnotateModalProps {
  blueprintId: string;
  photo: ReviewPhoto;
  onClose: () => void;
  onSaved: (photo: ReviewPhoto) => void;
}

export function AnnotateModal(props: AnnotateModalProps) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 text-sm text-white"
        >
          標註工具載入中⋯
        </div>
      }
    >
      <AnnotateEditor {...props} />
    </Suspense>
  );
}
