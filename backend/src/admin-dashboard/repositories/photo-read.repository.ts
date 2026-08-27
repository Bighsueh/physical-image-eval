import { prisma } from '../../lib/prisma';

/**
 * READ-ONLY photo access for the admin side (004). No write method exists here, and none may
 * be added — 004 mutates nothing (constitution XI, FR-036/SC-016).
 *
 * **Every query starts from `Review` filtered to `SUBMITTED` and joins outward to photos.**
 * That single choke point is what makes FR-028 structural: a photo attached to a draft is
 * unreachable by construction, not by a filter each caller has to remember. Querying
 * `ReviewPhoto` directly would open the side door that FR-007 ("drafts never enter statistics
 * or export") does not itself cover.
 */
const SUBMITTED_ONLY = { review: { status: 'SUBMITTED' as const } };

export interface AdminPhotoRow {
  id: string;
  panelIndex: number | null;
  caption: string | null;
  originalMimeType: string;
  annotatedByteSize: number | null;
  sortOrder: number;
  createdAt: Date;
  blueprintCode: string;
  reviewerId: string;
  reviewerDisplayName: string;
  reviewerIsActive: boolean;
}

const photoWithOwner = {
  id: true,
  panelIndex: true,
  caption: true,
  originalMimeType: true,
  annotatedByteSize: true,
  sortOrder: true,
  createdAt: true,
  review: {
    select: {
      blueprintCode: true,
      reviewer: { select: { id: true, displayName: true, isActive: true } },
    },
  },
} as const;

type RawRow = {
  id: string;
  panelIndex: number | null;
  caption: string | null;
  originalMimeType: string;
  annotatedByteSize: number | null;
  sortOrder: number;
  createdAt: Date;
  review: {
    blueprintCode: string;
    reviewer: { id: string; displayName: string; isActive: boolean };
  };
};

const flatten = (r: RawRow): AdminPhotoRow => ({
  id: r.id,
  panelIndex: r.panelIndex,
  caption: r.caption,
  originalMimeType: r.originalMimeType,
  annotatedByteSize: r.annotatedByteSize,
  sortOrder: r.sortOrder,
  createdAt: r.createdAt,
  blueprintCode: r.review.blueprintCode,
  reviewerId: r.review.reviewer.id,
  reviewerDisplayName: r.review.reviewer.displayName,
  reviewerIsActive: r.review.reviewer.isActive,
});

export const photoReadRepository = {
  /** Every submitted photo for one blueprint, ordered for stable display and archive naming. */
  async listForBlueprint(blueprintCode: string): Promise<AdminPhotoRow[]> {
    const rows = await prisma.reviewPhoto.findMany({
      where: { ...SUBMITTED_ONLY, review: { ...SUBMITTED_ONLY.review, blueprintCode } },
      select: photoWithOwner,
      orderBy: [{ panelIndex: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return (rows as RawRow[]).map(flatten);
  },

  /** Submitted photo counts per blueprint — the 附照片 column and the hasPhotos filter. */
  async countsByBlueprint(): Promise<Map<string, number>> {
    const rows = await prisma.reviewPhoto.groupBy({
      by: ['reviewId'],
      where: SUBMITTED_ONLY,
      _count: { _all: true },
    });
    if (rows.length === 0) return new Map();
    const reviews = await prisma.review.findMany({
      where: { id: { in: rows.map((r) => r.reviewId) } },
      select: { id: true, blueprintCode: true },
    });
    const codeById = new Map(reviews.map((r) => [r.id, r.blueprintCode]));
    const out = new Map<string, number>();
    for (const row of rows) {
      const code = codeById.get(row.reviewId);
      if (!code) continue;
      out.set(code, (out.get(code) ?? 0) + row._count._all);
    }
    return out;
  },

  /** Counts per (blueprint × reviewer) — the export's photo-count column. */
  async countsByReviewAndBlueprint(): Promise<Map<string, number>> {
    const rows = await prisma.reviewPhoto.findMany({
      where: SUBMITTED_ONLY,
      select: { review: { select: { blueprintCode: true, reviewerId: true } } },
    });
    const out = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.review.reviewerId}|${r.review.blueprintCode}`;
      out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
  },

  /**
   * One photo's metadata, scoped to submitted reviews. A draft photo's id therefore resolves to
   * null and the caller reports it as absent — indistinguishable from an unknown id (FR-028).
   */
  async findSubmitted(photoId: string): Promise<AdminPhotoRow | null> {
    const row = await prisma.reviewPhoto.findFirst({
      where: { id: photoId, ...SUBMITTED_ONLY },
      select: photoWithOwner,
    });
    return row ? flatten(row as RawRow) : null;
  },

  /** Bytes by primary key. The only path that touches the blob table (003 research D11). */
  async readBytes(
    photoId: string,
    variant: 'original' | 'display' | 'annotated' | 'originalAsJpeg',
  ): Promise<Buffer | null> {
    const row = await prisma.reviewPhotoBlob.findUnique({
      where: { photoId },
      select: { [variant]: true } as Record<string, boolean>,
    });
    const value = (row as Record<string, unknown> | null)?.[variant];
    return value instanceof Uint8Array
      ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
      : null;
  },
};
