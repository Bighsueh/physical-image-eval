import type { Prisma } from '@prisma/client';
import { AppError } from '../../../lib/errors';
import { STATUS_ID_TO_ZH } from '../../dto/enum-maps';
import { reviewRepository } from '../../repositories/review.repository';
import { toPhotoPayload, type ReviewPhotoPayload } from '../dto/review-photo.dto';
import { reviewPhotoRepository, type PhotoMeta } from '../repositories/review-photo.repository';
import { assertVariantAccepted } from './image-validation';
import { getUsage } from './photo-storage.service';

/**
 * Reference-photo workflow (FR-045..FR-061).
 *
 * `reviewerId` is ALWAYS the session account, passed in by the controller — never read from
 * the request (research D8). Two rules carry most of the weight here:
 *
 *  - A photo may be the FIRST thing saved for a blueprint, so an upload creates the review as
 *    草稿 when none exists (FR-050). This narrows the old "未開始 = no row" definition.
 *  - A photo operation on a 已提交 review must NOT regress it. Status and `submittedAt` are
 *    preserved; only `lastUpdatedAt` moves, and no re-submit is required (FR-051).
 *
 * Photo writes are immediate and independent of the debounced document PATCH (research D14),
 * so a slow upload never endangers typed text and vice versa.
 */

export interface UploadParts {
  original: Buffer;
  display: Buffer;
  originalAsJpeg: Buffer | null;
}

const requireBlueprint = async (code: string): Promise<void> => {
  if (!(await reviewRepository.blueprintExists(code))) throw new AppError('BLUEPRINT_NOT_FOUND');
};

/**
 * Resolve a photo the session reviewer owns. An unknown id and another reviewer's id are
 * deliberately indistinguishable — a 403 would confirm the id exists (FR-057).
 */
const requireOwned = async (photoId: string, reviewerId: string): Promise<PhotoMeta> => {
  const photo = await reviewPhotoRepository.findOwned(photoId, reviewerId);
  if (!photo) throw new AppError('PHOTO_NOT_FOUND');
  return photo;
};

/** Reject a new photo when the store is at its ceiling. Only ever called on the write paths
 * that ADD bytes — never on read, delete or review submission (FR-061/SC-020). */
const assertRoomForMoreBytes = async (): Promise<void> => {
  const usage = await getUsage();
  if (usage.isFull) throw new AppError('PHOTO_STORAGE_FULL');
};

export const reviewPhotoService = {
  async list(reviewerId: string, code: string): Promise<ReviewPhotoPayload[]> {
    const review = await reviewRepository.findOwnReviewWithPanels(reviewerId, code);
    if (!review) return [];
    const photos = await reviewPhotoRepository.listByReview(review.id);
    return photos.map((p) => toPhotoPayload(p, code));
  },

  async upload(
    reviewerId: string,
    code: string,
    parts: UploadParts,
    fields: { panelIndex: number | null; caption: string | null },
  ): Promise<{ photo: ReviewPhotoPayload; reviewStatus: string }> {
    await requireBlueprint(code);
    await assertRoomForMoreBytes();

    // Validate BEFORE creating the review row, so a rejected upload never leaves a stray draft.
    const originalMimeType = assertVariantAccepted('original', parts.original);
    assertVariantAccepted('display', parts.display);
    if (parts.originalAsJpeg) assertVariantAccepted('display', parts.originalAsJpeg);

    const review = await reviewRepository.ensureReviewForPhoto(reviewerId, code);
    const photo = await reviewPhotoRepository.create({
      reviewId: review.id,
      panelIndex: fields.panelIndex,
      caption: fields.caption,
      originalMimeType,
      original: parts.original,
      display: parts.display,
      originalAsJpeg: parts.originalAsJpeg,
    });

    return { photo: toPhotoPayload(photo, code), reviewStatus: STATUS_ID_TO_ZH[review.status] };
  },

  /**
   * Delete one of my photos. A photo that is not mine and a photo that no longer exists both
   * raise `PHOTO_NOT_FOUND` — deliberately indistinguishable.
   *
   * An earlier draft of this contract also promised idempotence (a second delete returning
   * 200). The two cannot both hold: telling "already deleted" apart from "not yours" is
   * exactly the existence oracle FR-057 forbids. Isolation wins; a client that double-clicks
   * delete sees a 404 for something that is, in fact, gone.
   */
  async remove(reviewerId: string, code: string, photoId: string): Promise<void> {
    await requireBlueprint(code);
    const deleted = await reviewPhotoRepository.deleteOwned(photoId, reviewerId);
    if (!deleted) throw new AppError('PHOTO_NOT_FOUND');
    await reviewRepository.touchReview(reviewerId, code);
  },

  async updateMeta(
    reviewerId: string,
    code: string,
    photoId: string,
    data: { caption?: string | null; sortOrder?: number },
  ): Promise<ReviewPhotoPayload> {
    await requireBlueprint(code);
    await requireOwned(photoId, reviewerId);
    const updated = await reviewPhotoRepository.updateMeta(photoId, data);
    await reviewRepository.touchReview(reviewerId, code);
    return toPhotoPayload(updated, code);
  },

  /**
   * Bytes for one variant. `annotated` on an un-annotated photo is reported as absent rather
   * than as an empty body — the variant genuinely does not exist.
   */
  async readVariant(
    reviewerId: string,
    photoId: string,
    variant: 'display' | 'original' | 'annotated',
  ): Promise<{ bytes: Buffer; contentType: string }> {
    const photo = await requireOwned(photoId, reviewerId);
    if (variant === 'annotated' && photo.annotatedByteSize == null) {
      throw new AppError('PHOTO_NOT_FOUND');
    }
    const bytes = await reviewPhotoRepository.readBytes(photoId, variant);
    if (!bytes) throw new AppError('PHOTO_NOT_FOUND');
    // Derivatives are always JPEG/PNG/WebP produced by our client; only the original may be
    // something else (HEIC), so only it carries a stored type.
    const contentType = variant === 'original' ? photo.originalMimeType : 'image/jpeg';
    return { bytes, contentType };
  },

  async getAnnotation(reviewerId: string, photoId: string): Promise<Prisma.JsonValue | null> {
    await requireOwned(photoId, reviewerId);
    return reviewPhotoRepository.readAnnotationState(photoId);
  },

  /**
   * Save an annotation. The flattened full-resolution image is authoritative; the design state
   * is what makes the annotation re-editable (FR-056). Neither ever overwrites the original
   * (FR-052). Last write wins — no version history.
   */
  async saveAnnotation(
    reviewerId: string,
    code: string,
    photoId: string,
    annotated: Buffer,
    annotationState: Prisma.InputJsonValue,
  ): Promise<ReviewPhotoPayload> {
    await requireBlueprint(code);
    const existing = await requireOwned(photoId, reviewerId);
    // A first-time annotation adds bytes; replacing one does not grow the store meaningfully,
    // so only the former is gated (FR-037).
    if (existing.annotatedByteSize == null) await assertRoomForMoreBytes();

    assertVariantAccepted('annotated', annotated);
    const updated = await reviewPhotoRepository.saveAnnotation(photoId, annotated, annotationState);
    await reviewRepository.touchReview(reviewerId, code);
    return toPhotoPayload(updated, code);
  },
};
