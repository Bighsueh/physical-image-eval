import { AlertTriangle } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

/** Keep focus inside `container` while Tab/Shift+Tab cycle past its first/last tabbable element. */
const trapTab = (container: HTMLElement, e: KeyboardEvent) => {
  if (e.key !== 'Tab') return;
  const focusable = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
};

/**
 * A modal that *explains* rather than asks — for the moment an action was refused and the reason
 * needs to be impossible to miss. `role="alertdialog"` (not `dialog`) so screen readers announce
 * it as an interruption.
 *
 * It never replaces the inline message beside the control: the modal makes the problem noticed,
 * the inline message keeps it visible after the modal is dismissed.
 *
 * The optional `actionLabel` is the way out of the problem ("前往圖2"), so the reviewer does not
 * have to hunt for what the message just described.
 */
interface AlertDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  /** Primary action that resolves the problem; falls back to a plain dismiss when absent. */
  actionLabel?: string;
  onAction?: () => void;
  dismissLabel?: string;
  onDismiss: () => void;
}

export function AlertDialog({
  open,
  title,
  children,
  actionLabel,
  onAction,
  dismissLabel = '知道了',
  onDismiss,
}: AlertDialogProps) {
  const actionRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    // Focus the way OUT of the problem, so Enter does the useful thing. When there is no such
    // action, focus the dismiss button instead — leaving focus outside the modal would let Tab
    // wander into the page behind it, and the trap only engages once focus is inside.
    (actionRef.current ?? dismissRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismissRef.current();
      else if (panelRef.current) trapTab(panelRef.current, e);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      (triggerRef.current as HTMLElement | null)?.focus?.(); // WCAG 2.4.3
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-body"
      onClick={onDismiss}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl"
      >
        <h2 id="alert-dialog-title" className="flex items-center gap-2 text-lg font-bold text-ink">
          <AlertTriangle className="h-5 w-5 text-accent-deep" aria-hidden="true" />
          {title}
        </h2>
        <div id="alert-dialog-body" className="mt-3 text-sm text-ink">
          {children}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button ref={dismissRef} variant="secondary" onClick={onDismiss}>
            {dismissLabel}
          </Button>
          {actionLabel && (
            <Button ref={actionRef} onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
