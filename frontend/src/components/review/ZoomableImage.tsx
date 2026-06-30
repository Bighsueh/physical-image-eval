import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';

/** Inline (no-lightbox) zoom/pan of the 2×2 PNG (FR-006). Keyboard: +/- zoom, arrows pan, 0 reset.
 * Default shows the whole image (fit). Source bytes are untouched — this is pure CSS transform. */
const MIN = 1;
const MAX = 4;
const STEP = 0.25;
const PAN = 40;

export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const clampScale = (s: number) => Math.min(MAX, Math.max(MIN, Math.round(s * 100) / 100));
  const zoom = (delta: number) => setScale((s) => clampScale(s + delta));
  const reset = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoom(STEP);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoom(-STEP);
    } else if (e.key === '0') {
      e.preventDefault();
      reset();
    } else if (scale > 1 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      setPan((p) => ({
        x: p.x + (e.key === 'ArrowLeft' ? PAN : e.key === 'ArrowRight' ? -PAN : 0),
        y: p.y + (e.key === 'ArrowUp' ? PAN : e.key === 'ArrowDown' ? -PAN : 0),
      }));
    }
  };

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-xl border border-border bg-white"
        tabIndex={0}
        role="group"
        aria-label="受審圖（可縮放，鍵盤 + - 縮放、方向鍵平移、0 還原）"
        onKeyDown={onKeyDown}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoom(e.deltaY < 0 ? STEP : -STEP);
          }
        }}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          draggable={false}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: 'transform 120ms ease-out',
          }}
          className="w-full select-none"
        />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => zoom(-STEP)}
          aria-label="縮小"
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-border bg-surface hover:bg-surface-sunken disabled:opacity-40"
          disabled={scale <= MIN}
        >
          <Minus className="w-4 h-4" aria-hidden="true" />
        </button>
        <span className="nums w-12 text-center text-ink-soft">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={() => zoom(STEP)}
          aria-label="放大"
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-border bg-surface hover:bg-surface-sunken disabled:opacity-40"
          disabled={scale >= MAX}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 px-3 h-9 rounded-xl border border-border bg-surface hover:bg-surface-sunken text-ink-soft"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          還原
        </button>
      </div>
    </div>
  );
}
