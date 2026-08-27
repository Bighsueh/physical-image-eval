import type { PhotoMeta } from '../repositories/review-photo.repository';

/**
 * Wire shape for a reference photo. Bytes are **never** inlined — a review with a dozen
 * photos would otherwise carry tens of megabytes of base64 in a JSON envelope. Callers fetch
 * each variant through the file route.
 */
export interface ReviewPhotoPayload {
  id: string;
  panelIndex: number | null;
  caption: string | null;
  annotated: boolean;
  sortOrder: number;
  createdAt: string;
  urls: {
    display: string;
    original: string;
    /** null until the photo has been annotated — the variant simply does not exist yet. */
    annotated: string | null;
  };
}

export const toPhotoPayload = (photo: PhotoMeta, blueprintCode: string): ReviewPhotoPayload => {
  const base = `/api/reviews/${blueprintCode}/photos/${photo.id}/file`;
  const isAnnotated = photo.annotatedByteSize != null;
  return {
    id: photo.id,
    panelIndex: photo.panelIndex,
    // Free text returned VERBATIM, consistent with the other review free-text fields: the
    // frontend binds it into controlled inputs, and the CSV export neutralizes at its own
    // boundary. Escaping here would corrupt captions containing < > &.
    caption: photo.caption,
    annotated: isAnnotated,
    sortOrder: photo.sortOrder,
    createdAt: photo.createdAt.toISOString(),
    urls: {
      display: `${base}?variant=display`,
      original: `${base}?variant=original`,
      annotated: isAnnotated ? `${base}?variant=annotated` : null,
    },
  };
};
