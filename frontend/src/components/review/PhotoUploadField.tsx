import { AlertTriangle, Plus } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { ReviewPhoto } from '../../api/review-photos';
import type { PendingUpload } from '../../hooks/useReviewPhotos';
import { PendingThumb, PhotoThumb } from './PhotoThumb';

/**
 * The 參考照片 block — one per panel, plus one at image level.
 *
 * There is deliberately **no photo limit** (FR-048): this is an internal tool used by a handful
 * of clinicians, and a cap would only ever get in their way. The header shows a count, not a
 * quota.
 *
 * On desktop the entry also accepts a drop; on mobile the plain file input is what makes the OS
 * offer 拍照／照片圖庫／瀏覽檔案 from a single tap — a `capture` attribute would force the
 * camera and take the album away.
 */
export function PhotoUploadField({
  label,
  hint,
  photos,
  pending,
  panelIndex,
  storageFull,
  onAdd,
  onOpen,
  onDelete,
  onCaption,
  onAnnotate,
  onRetry,
  onDismiss,
}: {
  label: string;
  hint: string;
  photos: ReviewPhoto[];
  pending: PendingUpload[];
  panelIndex: number | null;
  storageFull: boolean;
  onAdd: (files: File[], panelIndex: number | null) => void;
  onOpen: (photo: ReviewPhoto) => void;
  onDelete: (photoId: string) => void;
  onCaption: (photoId: string, caption: string) => void;
  onAnnotate: (photo: ReviewPhoto) => void;
  onRetry: (key: string) => void;
  onDismiss: (key: string) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length > 0) onAdd(files, panelIndex);
    if (inputRef.current) inputRef.current.value = ''; // allow re-picking the same file
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <label htmlFor={inputId} className="text-xs font-medium text-ink-soft">
          {label} <span className="font-normal">（選填）</span>
        </label>
        <span className="text-[11px] text-ink-soft nums">已上傳 {photos.length} 張</span>
      </div>
      <p className="mt-0.5 mb-2 text-[11px] text-ink-soft">{hint}</p>

      <div className="flex flex-wrap gap-2.5 items-start">
        {photos.map((photo) => (
          <PhotoThumb
            key={photo.id}
            photo={photo}
            onOpen={onOpen}
            onDelete={onDelete}
            onCaption={onCaption}
            onAnnotate={onAnnotate}
          />
        ))}
        {pending.map((item) => (
          <PendingThumb key={item.key} item={item} onRetry={onRetry} onDismiss={onDismiss} />
        ))}

        {storageFull ? (
          <div
            role="status"
            className="w-[104px] h-[104px] rounded-[10px] border border-accent bg-accent-tint text-accent-deep flex flex-col items-center justify-center gap-1 p-2 text-center text-[11px]"
          >
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            照片儲存空間已滿，請聯絡管理員
          </div>
        ) : (
          <>
            <label
              htmlFor={inputId}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                take(e.dataTransfer.files);
              }}
              className={`w-[104px] h-[104px] rounded-[10px] border-[1.5px] border-dashed flex flex-col items-center justify-center gap-0.5 text-xs font-medium text-center leading-tight cursor-pointer ${
                dragging
                  ? 'border-primary-deep bg-primary-tint text-primary-deep'
                  : 'border-primary bg-primary-tint text-primary-deep'
              }`}
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
              上傳照片
              <span className="text-[10.5px] font-normal opacity-80">或拖曳進來</span>
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="sr-only"
              onChange={(e) => take(e.target.files)}
            />
          </>
        )}
      </div>
    </div>
  );
}
