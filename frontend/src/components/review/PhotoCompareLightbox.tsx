import { ChevronLeft, ChevronRight, Download, Image as ImageIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReviewPhoto } from '../../api/review-photos';

/**
 * Side-by-side comparison: the panel as the AIGC image drew it, next to the photo the reviewer
 * took. 「這個不對，應該長這樣」 reads instantly this way, and it is the same view the person
 * repairing the image will work from.
 *
 * When the photo has been annotated, a toggle returns to the untouched original — so you can
 * check whether an arrow is covering the detail it points at.
 */
export function PhotoCompareLightbox({
  photos,
  index,
  blueprintImageUrl,
  panelLabel,
  onClose,
  onIndexChange,
}: {
  photos: ReviewPhoto[];
  index: number;
  blueprintImageUrl: string;
  panelLabel: string;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const photo = photos[index];

  useEffect(() => {
    setShowOriginal(false);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndexChange(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onIndexChange]);

  if (!photo) return null;
  const photoSrc = showOriginal ? photo.urls.original : (photo.urls.annotated ?? photo.urls.display);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="參考照片對照檢視"
      className="fixed inset-0 z-50 bg-ink/80 p-4 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-2xl bg-[#2A2A25] p-4 text-[#F2EDE1]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 pb-2.5 text-xs text-[#CFC7B4] flex-wrap">
          <span>{panelLabel}</span>
          <span className="flex items-center gap-3">
            <span className="nums">
              參考照片 {index + 1} / {photos.length}
            </span>
            <button type="button" onClick={onClose} className="inline-flex items-center gap-1">
              <X className="w-4 h-4" aria-hidden="true" />
              關閉
            </button>
          </span>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2">
          <figure className="m-0 flex flex-col gap-1.5">
            <div className="rounded-[10px] overflow-hidden bg-[#1E1E1A] border border-[#45443C]">
              <img
                src={blueprintImageUrl}
                alt="受審圖"
                className="w-full h-[280px] object-contain bg-[#FFFDF7]"
              />
            </div>
            <figcaption className="text-xs text-[#CFC7B4]">目前的 AIGC 產出</figcaption>
          </figure>
          <figure className="m-0 flex flex-col gap-1.5">
            <div className="rounded-[10px] overflow-hidden bg-[#1E1E1A] border border-[#45443C]">
              <img
                src={photoSrc}
                alt={photo.caption ?? '審查者拍攝的參考照片'}
                className="w-full h-[280px] object-contain"
              />
            </div>
            <figcaption className="flex items-center justify-between gap-2 text-xs text-[#CFC7B4] flex-wrap">
              <span>{photo.caption ?? '參考照片'}</span>
              {photo.annotated && (
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-full border border-[#55534A] px-2 py-0.5"
                >
                  <ImageIcon className="w-3 h-3" aria-hidden="true" />
                  {showOriginal ? '看標註版' : '看原圖'}
                </button>
              )}
            </figcaption>
          </figure>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3 text-[11.5px] text-[#A79E8C]">
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            disabled={index === 0}
            className="inline-flex items-center gap-0.5 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            上一張
          </button>
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            disabled={index >= photos.length - 1}
            className="inline-flex items-center gap-0.5 disabled:opacity-40"
          >
            下一張
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <a
            href={photo.urls.original}
            download
            className="inline-flex items-center gap-1 hover:text-[#EDE7DA]"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            下載原始照片
          </a>
          <span>Esc 關閉 · ←/→ 切換</span>
        </div>
      </div>
    </div>
  );
}
