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
 * Accessible confirm modal for destructive / irreversible actions (confirmation-dialogs UX rule).
 * Portaled to <body> so it escapes any sticky/stacking context; role=dialog + aria-modal; Esc and
 * backdrop click cancel; focus moves to Cancel (safe default) on open and returns to the trigger on
 * close; body scroll locked while open. Confirm is `danger` by default. The parent owns `open`.
 */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = '取消',
  confirmVariant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  // Read latest loading/onCancel via refs so the lifecycle effect depends ONLY on `open` — a change
  // to `loading` (e.g. while a delete is in flight) must NOT tear down + rebuild the dialog, which
  // would briefly unlock scroll and bounce focus to the trigger (WCAG 2.4.3).
  const loadingRef = useRef(loading);
  const onCancelRef = useRef(onCancel);
  loadingRef.current = loading;
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement; // remember the trigger to restore focus later
    cancelRef.current?.focus(); // focus the SAFE action by default (destructive default avoided)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loadingRef.current) onCancelRef.current();
      else if (panelRef.current) trapTab(panelRef.current, e); // keep focus inside the dialog
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      (triggerRef.current as HTMLElement | null)?.focus?.(); // WCAG 2.4.3 — return focus on close
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => !loading && onCancel()}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl"
      >
        <h2
          id="confirm-dialog-title"
          className="flex items-center gap-2 text-lg font-bold text-ink"
        >
          {confirmVariant === 'danger' && (
            <AlertTriangle className="h-5 w-5 text-accent-deep" aria-hidden="true" />
          )}
          {title}
        </h2>
        <div className="mt-3 text-sm text-ink">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
