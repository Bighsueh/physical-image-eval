import { Maximize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Click the image to open a full-screen preview (Facebook-style lightbox) — replaces the inline
 * zoom. Accessible: role=dialog + aria-modal, Esc/backdrop/✕ to close, focus moves to the close
 * button, body scroll locked while open. The image fits the viewport (object-contain).
 */
export function ImageLightbox({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div data-tour="image">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="點擊放大，全螢幕預覽圖片"
        className="group relative block w-full overflow-hidden rounded-xl border border-border bg-white focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <img src={src} alt={alt} loading="lazy" className="w-full" />
        <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink/70 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
          點擊放大
        </span>
      </button>
      <p className="mt-1.5 text-xs text-ink-soft">點圖可全螢幕預覽，細看四格的文字與箭頭。</p>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`預覽：${alt}`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="關閉預覽"
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] max-w-[96vw] object-contain"
          />
        </div>
      )}
    </div>
  );
}
