import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

/**
 * Prisma data access for reference photos.
 *
 * **Every query on this repository uses an explicit `select`.** Prisma's default is to return
 * all scalar columns, which on the blob table means loading whole photos into process memory —
 * that is exactly why the bytes live in their own table (research D11). There is deliberately
 * no `findMany` over `ReviewPhotoBlob`: bytes are reachable only by primary key, from an
 * already-authorized `ReviewPhoto`.
 */

/**
 * Prisma maps `Bytes` to `Uint8Array<ArrayBuffer>`, while multer hands us `Buffer`, whose
 * backing store is typed `ArrayBufferLike` (it may be pooled). A view over that buffer does
 * not satisfy the narrower type, so this copies. One copy per upload of a few megabytes is
 * not worth defeating the type system over; reads convert back with a view, which is free.
 */
const toBytes = (buf: Buffer): Uint8Array<ArrayBuffer> => {
  // Allocating by length (rather than wrapping) is what pins the backing store to a plain
  // ArrayBuffer, which is the exact type Prisma's Bytes column expects.
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
};
const toBuffer = (bytes: Uint8Array): Buffer =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Metadata projection — never includes bytes. */
const photoMeta = {
  id: true,
  reviewId: true,
  panelIndex: true,
  caption: true,
  originalMimeType: true,
  originalByteSize: true,
  displayByteSize: true,
  annotatedByteSize: true,
  annotatedAt: true,
  sortOrder: true,
  createdAt: true,
} satisfies Prisma.ReviewPhotoSelect;

export type PhotoMeta = Prisma.ReviewPhotoGetPayload<{ select: typeof photoMeta }>;

export interface CreatePhotoInput {
  reviewId: string;
  panelIndex: number | null;
  caption: string | null;
  originalMimeType: string;
  original: Buffer;
  display: Buffer;
  originalAsJpeg: Buffer | null;
}

export const reviewPhotoRepository = {
  /** All photos of one review, ordered for display. Metadata only. */
  listByReview(reviewId: string): Promise<PhotoMeta[]> {
    return prisma.reviewPhoto.findMany({
      where: { reviewId },
      select: photoMeta,
      orderBy: [{ panelIndex: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  },

  /**
   * Photo counts per panel for one review, for the submit gate (FR-049). Image-level photos
   * (`panelIndex = null`) are excluded — they belong to no panel and must not satisfy one.
   * Accepts a transaction client so the count can be read inside the submit transaction, which
   * is the only place it is consistent with the document being submitted (research D15).
   */
  async panelPhotoCounts(
    reviewId: string,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<Map<number, number>> {
    const rows = await client.reviewPhoto.groupBy({
      by: ['panelIndex'],
      where: { reviewId, panelIndex: { not: null } },
      _count: { _all: true },
    });
    return new Map(
      rows
        .filter((r): r is typeof r & { panelIndex: number } => r.panelIndex !== null)
        .map((r) => [r.panelIndex, r._count._all]),
    );
  },

  /**
   * Resolve a photo id **scoped to its owner**. Returns null both for an unknown id and for
   * another reviewer's photo, so the caller raises the same `PHOTO_NOT_FOUND` either way —
   * a 403 would confirm the id exists (FR-057).
   */
  findOwned(photoId: string, reviewerId: string): Promise<PhotoMeta | null> {
    return prisma.reviewPhoto.findFirst({
      where: { id: photoId, review: { reviewerId } },
      select: photoMeta,
    });
  },

  async create(input: CreatePhotoInput): Promise<PhotoMeta> {
    const { original, display, originalAsJpeg, ...meta } = input;
    return prisma.reviewPhoto.create({
      data: {
        ...meta,
        originalByteSize: original.byteLength,
        displayByteSize: display.byteLength,
        blob: {
          create: {
            original: toBytes(original),
            display: toBytes(display),
            originalAsJpeg: originalAsJpeg ? toBytes(originalAsJpeg) : null,
          },
        },
      },
      select: photoMeta,
    });
  },

  /** Idempotent: deleting an already-deleted photo is a no-op. Bytes cascade. */
  async deleteOwned(photoId: string, reviewerId: string): Promise<boolean> {
    const { count } = await prisma.reviewPhoto.deleteMany({
      where: { id: photoId, review: { reviewerId } },
    });
    return count > 0;
  },

  async updateMeta(
    photoId: string,
    data: { caption?: string | null; sortOrder?: number },
  ): Promise<PhotoMeta> {
    return prisma.reviewPhoto.update({ where: { id: photoId }, data, select: photoMeta });
  },

  /** One variant's bytes, by primary key. The only path that touches the blob table. */
  async readBytes(
    photoId: string,
    variant: 'original' | 'display' | 'annotated' | 'originalAsJpeg',
  ): Promise<Buffer | null> {
    const row = await prisma.reviewPhotoBlob.findUnique({
      where: { photoId },
      select: { [variant]: true } as Record<string, boolean>,
    });
    const value = (row as Record<string, unknown> | null)?.[variant];
    return value instanceof Uint8Array ? toBuffer(value) : null;
  },

  async saveAnnotation(
    photoId: string,
    annotated: Buffer,
    annotationState: Prisma.InputJsonValue,
  ): Promise<PhotoMeta> {
    const [, meta] = await prisma.$transaction([
      prisma.reviewPhotoBlob.update({ where: { photoId }, data: { annotated: toBytes(annotated) } }),
      prisma.reviewPhoto.update({
        where: { id: photoId },
        data: { annotationState, annotatedAt: new Date(), annotatedByteSize: annotated.byteLength },
        select: photoMeta,
      }),
    ]);
    return meta;
  },

  async readAnnotationState(photoId: string): Promise<Prisma.JsonValue | null> {
    const row = await prisma.reviewPhoto.findUnique({
      where: { id: photoId },
      select: { annotationState: true },
    });
    return row?.annotationState ?? null;
  },
};
