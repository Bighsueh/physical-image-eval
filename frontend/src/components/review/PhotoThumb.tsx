import { AlertTriangle, Pencil, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import type { ReviewPhoto } from '../../api/review-photos';
import type { PendingUpload } from '../../hooks/useReviewPhotos';

/**
 * One reference photo. Shows the annotated version once there is one, so what the reviewer
 * sees is what they drew — the original stays one click away in the lightbox.
 */
export function PhotoThumb({
  photo,
  onOpen,
  onDelete,
  onCaption,
  onAnnotate,
}: {
  photo: ReviewPhoto;
  onOpen: (photo: ReviewPhoto) => void;
  onDelete: (photoId: string) => void;
  onCaption: (photoId: string, caption: string) => void;
  onAnnotate: (photo: ReviewPhoto) => void;
}) {
  const [caption, setCaption] = useState(photo.caption ?? '');
  const src = photo.urls.annotated ?? photo.urls.display;

  return (
    <div className="w-[104px] flex flex-col gap-1.5">
      <div className="relative h-[104px] rounded-[10px] overflow-hidden border border-border bg-surface-sunken">
        <button
          type="button"
          onClick={() => onOpen(photo)}
          className="block h-full w-full"
          aria-label={`放大檢視參考照片${photo.caption ? `：${photo.caption}` : ''}`}
        >
          <img src={src} alt={photo.caption ?? '參考照片'} className="h-full w-full object-cover" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(photo.id)}
          aria-label="刪除這張參考照片"
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink/70 text-white text-xs flex items-center justify-center hover:bg-ink"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
        {/* Mobile has no hover, so the annotate entry is always visible rather than revealed. */}
        <button
          type="button"
          onClick={() => onAnnotate(photo)}
          className="absolute left-1 bottom-1 inline-flex items-center gap-1 rounded-full bg-ink/75 px-2 py-0.5 text-[11px] text-white hover:bg-ink"
        >
          <Pencil className="w-3 h-3" aria-hidden="true" />
          標註
        </button>
        {photo.annotated && (
          // Icon + text, never colour alone (constitution IX).
          <span className="absolute right-1 bottom-1 inline-flex items-center gap-0.5 rounded-full border border-warn bg-warn-tint px-1.5 text-[10px] font-semibold text-warn-deep">
            <Pencil className="w-2.5 h-2.5" aria-hidden="true" />
            已標註
          </span>
        )}
      </div>
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => caption !== (photo.caption ?? '') && onCaption(photo.id, caption)}
        placeholder="加一句說明"
        aria-label="這張照片的說明"
        className="rounded-md border border-dashed border-border bg-surface px-1.5 py-0.5 text-[11px] text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}

/** A file still on its way — or one that failed, with its retry in place beside it. */
export function PendingThumb({
  item,
  onRetry,
  onDismiss,
}: {
  item: PendingUpload;
  onRetry: (key: string) => void;
  onDismiss: (key: string) => void;
}) {
  const failed = item.phase === 'error';
  return (
    <div className="w-[104px] flex flex-col gap-1.5">
      <div
        className={`relative h-[104px] rounded-[10px] border flex flex-col items-center justify-center gap-1 p-1.5 text-center text-[11px] ${
          failed
            ? 'border-accent bg-accent-tint text-accent-deep'
            : 'border-border bg-surface-sunken text-ink-soft'
        }`}
        role="status"
        aria-live="polite"
      >
        {failed ? (
          <>
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            <span className="leading-tight">{item.message}</span>
            {!item.storageFull && (
              <button
                type="button"
                onClick={() => onRetry(item.key)}
                className="inline-flex items-center gap-0.5 rounded-md border border-accent px-1.5 py-0.5 text-[11px] font-medium"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                重試
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(item.key)}
              aria-label="移除這個失敗的上傳"
              className="absolute top-1 right-1 text-accent-deep"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </>
        ) : (
          <span>{item.phase === 'preparing' ? '準備中⋯' : '上傳中⋯'}</span>
        )}
      </div>
      <span className="truncate text-[11px] text-ink-soft" title={item.file.name}>
        {item.file.name}
      </span>
    </div>
  );
}
