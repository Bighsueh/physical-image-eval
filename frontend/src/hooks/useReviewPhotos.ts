import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deletePhoto,
  PhotoApiError,
  updatePhotoCaption,
  uploadPhoto,
  type ReviewPhoto,
} from '../api/review-photos';
import { prepareImage, UnsupportedImageError } from '../lib/prepareImage';

/**
 * Reference-photo state for one blueprint.
 *
 * Deliberately NOT part of `useAutosaveReview`: photo writes are immediate, while the review
 * document is debounced. Keeping them apart means a 4 MB upload never delays a keystroke save,
 * and a failed upload never fails the draft.
 *
 * Each file gets its own independent state machine, so one failure among several cannot take
 * the others down with it (FR-058).
 */
export type UploadPhase = 'preparing' | 'uploading' | 'error';

export interface PendingUpload {
  /** Stable per attempt, so retrying keeps its place in the list. */
  key: string;
  file: File;
  panelIndex: number | null;
  phase: UploadPhase;
  /** zh-TW copy for the failure — shown in place, next to the file it belongs to. */
  message?: string;
  /** Set when the failure is the storage ceiling; the UI disables further uploads. */
  storageFull?: boolean;
}

export interface ReviewPhotosController {
  photos: ReviewPhoto[];
  pending: PendingUpload[];
  storageFull: boolean;
  add: (files: File[], panelIndex: number | null) => void;
  retry: (key: string) => void;
  dismiss: (key: string) => void;
  remove: (photoId: string) => Promise<void>;
  setCaption: (photoId: string, caption: string) => Promise<void>;
  /** Replace one photo in local state after an annotation round-trip. */
  replace: (photo: ReviewPhoto) => void;
  countFor: (panelIndex: number | null) => number;
}

let uploadKeySeq = 0;

export function useReviewPhotos(
  blueprintId: string,
  initial: ReviewPhoto[],
): ReviewPhotosController {
  const [photos, setPhotos] = useState<ReviewPhoto[]>(initial);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [storageFull, setStorageFull] = useState(false);
  // Opening another blueprint must not leak the previous one's photos into the new page.
  const blueprintRef = useRef(blueprintId);
  // `initial` is typically a fresh array on every render (`data.review.photos ?? []`), so it
  // MUST NOT be an effect dependency — doing so re-seeds state on every render, which re-renders,
  // which re-runs the effect. Read it through a ref and key the reset on the blueprint alone.
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    blueprintRef.current = blueprintId;
    setPhotos(initialRef.current);
    setPending([]);
    setStorageFull(false);
  }, [blueprintId]);

  const patchPending = useCallback((key: string, next: Partial<PendingUpload>) => {
    setPending((cur) => cur.map((p) => (p.key === key ? { ...p, ...next } : p)));
  }, []);

  const run = useCallback(
    async (item: PendingUpload) => {
      const forBlueprint = blueprintRef.current;
      try {
        patchPending(item.key, { phase: 'preparing', message: undefined });
        const prepared = await prepareImage(item.file);

        patchPending(item.key, { phase: 'uploading' });
        const { photo } = await uploadPhoto(forBlueprint, {
          ...prepared,
          panelIndex: item.panelIndex,
        });

        // A late response for a blueprint the reviewer has already left is dropped rather than
        // pushed into the wrong page's list.
        if (blueprintRef.current !== forBlueprint) return;
        setPhotos((cur) => [...cur, photo]);
        setPending((cur) => cur.filter((p) => p.key !== item.key));
      } catch (err) {
        if (blueprintRef.current !== forBlueprint) return;
        const isFull = err instanceof PhotoApiError && err.code === 'PHOTO_STORAGE_FULL';
        if (isFull) setStorageFull(true);
        patchPending(item.key, {
          phase: 'error',
          storageFull: isFull,
          message:
            err instanceof UnsupportedImageError
              ? err.message
              : err instanceof PhotoApiError
                ? err.message
                : '上傳失敗，請檢查連線後重試',
        });
      }
    },
    [patchPending],
  );

  const add = useCallback(
    (files: File[], panelIndex: number | null) => {
      const items = files.map<PendingUpload>((file) => ({
        key: `up-${(uploadKeySeq += 1)}`,
        file,
        panelIndex,
        phase: 'preparing',
      }));
      setPending((cur) => [...cur, ...items]);
      // Each file runs independently — one rejection never cancels its siblings (FR-058).
      items.forEach((item) => void run(item));
    },
    [run],
  );

  const retry = useCallback(
    (key: string) => {
      setPending((cur) => {
        const item = cur.find((p) => p.key === key);
        if (item) void run(item);
        return cur;
      });
      setStorageFull(false);
    },
    [run],
  );

  const dismiss = useCallback((key: string) => {
    setPending((cur) => cur.filter((p) => p.key !== key));
  }, []);

  const remove = useCallback(
    async (photoId: string) => {
      await deletePhoto(blueprintRef.current, photoId);
      setPhotos((cur) => cur.filter((p) => p.id !== photoId));
    },
    [],
  );

  const setCaption = useCallback(async (photoId: string, caption: string) => {
    const { photo } = await updatePhotoCaption(blueprintRef.current, photoId, caption || null);
    setPhotos((cur) => cur.map((p) => (p.id === photo.id ? photo : p)));
  }, []);

  const replace = useCallback((photo: ReviewPhoto) => {
    setPhotos((cur) => cur.map((p) => (p.id === photo.id ? photo : p)));
  }, []);

  /**
   * Photos bound to one panel. This is what mirrors the server's submit gate client-side, so
   * the UI never blocks a submit the server would accept (FR-049).
   */
  const countFor = useCallback(
    (panelIndex: number | null) => photos.filter((p) => p.panelIndex === panelIndex).length,
    [photos],
  );

  return { photos, pending, storageFull, add, retry, dismiss, remove, setCaption, replace, countFor };
}
