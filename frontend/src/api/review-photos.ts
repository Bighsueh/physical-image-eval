import { apiFetch } from './client';
import { readCsrfToken } from '../lib/csrf';

/**
 * Reference-photo API. Separate from `api/reviews.ts` on purpose: photo mutations are
 * immediate, while the review document is debounced — keeping them apart is what stops a slow
 * upload from delaying typed text, or a failed upload from failing a draft save.
 *
 * Uploads are multipart, so they bypass `apiFetch` (which sets a JSON content type); the CSRF
 * header and envelope handling are reproduced here rather than generalized, because this is
 * the only multipart surface in the app.
 */
export interface ReviewPhoto {
  id: string;
  panelIndex: number | null;
  caption: string | null;
  annotated: boolean;
  sortOrder: number;
  createdAt: string;
  urls: { display: string; original: string; annotated: string | null };
}

export interface UploadResult {
  photo: ReviewPhoto;
  reviewStatus: string;
}

/** Thrown with the stable code so the UI can branch (storage full vs unsupported vs network). */
export class PhotoApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PhotoApiError';
  }
}

export interface UploadPayload {
  /** The user's file, forwarded untouched — the server keeps it byte-for-byte (FR-052). */
  original: Blob;
  originalName: string;
  /** ~1600px JPEG the browser produced; every on-screen view reads this one. */
  display: Blob;
  /** Only when the original is HEIC, so an admin bundle always holds an openable file. */
  originalAsJpeg?: Blob;
  panelIndex?: number | null;
  caption?: string | null;
}

const postMultipart = async <T>(
  path: string,
  body: FormData,
  method: 'POST' | 'PUT' = 'POST',
  signal?: AbortSignal,
): Promise<T> => {
  const csrf = readCsrfToken();
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    body,
    signal,
  });
  const envelope = await res.json().catch(() => null);
  if (!res.ok || !envelope?.success) {
    throw new PhotoApiError(
      envelope?.error?.code ?? 'UNKNOWN',
      envelope?.error?.message ?? '照片上傳失敗，請再試一次',
      res.status,
    );
  }
  return envelope.data as T;
};

export const uploadPhoto = (
  blueprintId: string,
  payload: UploadPayload,
  signal?: AbortSignal,
): Promise<UploadResult> => {
  const form = new FormData();
  form.append('original', payload.original, payload.originalName);
  form.append('display', payload.display, 'display.jpg');
  if (payload.originalAsJpeg) form.append('originalAsJpeg', payload.originalAsJpeg, 'full.jpg');
  if (payload.panelIndex != null) form.append('panelIndex', String(payload.panelIndex));
  if (payload.caption) form.append('caption', payload.caption);
  return postMultipart<UploadResult>(`/reviews/${blueprintId}/photos`, form, 'POST', signal);
};

export const deletePhoto = (blueprintId: string, photoId: string): Promise<{ deleted: boolean }> =>
  apiFetch<{ deleted: boolean }>(`/reviews/${blueprintId}/photos/${photoId}`, {
    method: 'DELETE',
  }).then((r) => r.data);

export const updatePhotoCaption = (
  blueprintId: string,
  photoId: string,
  caption: string | null,
): Promise<{ photo: ReviewPhoto }> =>
  apiFetch<{ photo: ReviewPhoto }>(`/reviews/${blueprintId}/photos/${photoId}`, {
    method: 'PATCH',
    // Normalize here as well as in the hook: an empty caption means "no caption", and relying
    // on the server's coercion to say so would leave the intent implicit at this boundary.
    body: { caption: caption === '' ? null : caption },
  }).then((r) => r.data);

export const getAnnotation = (
  blueprintId: string,
  photoId: string,
): Promise<{ annotationState: unknown }> =>
  apiFetch<{ annotationState: unknown }>(
    `/reviews/${blueprintId}/photos/${photoId}/annotation`,
  ).then((r) => r.data);

export const saveAnnotation = (
  blueprintId: string,
  photoId: string,
  annotated: Blob,
  annotationState: unknown,
): Promise<{ photo: ReviewPhoto }> => {
  const form = new FormData();
  form.append('annotated', annotated, 'annotated.png');
  form.append('annotationState', JSON.stringify(annotationState));
  return postMultipart<{ photo: ReviewPhoto }>(
    `/reviews/${blueprintId}/photos/${photoId}/annotation`,
    form,
    'PUT',
  );
};
