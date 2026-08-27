import {
  Prisma,
  type IndicationJudgement,
  type OverallJudgement,
  type ProblemType,
  type ReviewStatus,
  type WarningType,
} from '@prisma/client';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { unaddressedPanels, type PanelGateInput } from '../services/panel-gate';

/**
 * Run a transaction at SERIALIZABLE isolation, retrying on a write-conflict (P2034). This closes
 * the autosave-vs-submit race: the status machine reads `existing` and writes inside one tx, and
 * Postgres aborts the loser of a concurrent write so the retry re-reads the committed status and
 * converges to the correct value (submit wins; autosave never regresses 已提交 — FR-026).
 */
const runSerializable = async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (err) {
      const conflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
      if (conflict && attempt < 3) continue;
      throw err;
    }
  }
};

/**
 * Prisma data access for the review domain. `upsertReviewWithPanels` does the whole write in ONE
 * transaction: upsert the Review on (reviewerId, blueprintCode) and snapshot-replace its 4 panels.
 * The status machine (research D4) is computed INSIDE the tx from the existing row. The blueprint is
 * referenced by BUSINESS CODE (no FK to Blueprint.id) so catalog re-ingestion never touches reviews.
 */
export interface PanelWrite {
  panelIndex: number;
  noProblem: boolean;
  requiredWarnings: WarningType[];
  warningOther: string | null;
  problemTypes: ProblemType[];
  problemNote: string | null;
}

export interface UpsertReviewInput {
  reviewerId: string;
  blueprintCode: string;
  overallJudgement: OverallJudgement | null;
  indicationJudgement: IndicationJudgement | null;
  indicationNote: string | null;
  otherComment: string | null;
  panels: PanelWrite[];
  intent: 'autosave' | 'submit';
}

/** An empty panel row — the shape a Review must always have four of. */
const blankPanel = (panelIndex: number) => ({
  panelIndex,
  noProblem: false,
  requiredWarnings: [] as WarningType[],
  warningOther: null,
  problemTypes: [] as ProblemType[],
  problemNote: null,
});

const reviewWithPanels = {
  include: { panels: { orderBy: { panelIndex: 'asc' } } },
} satisfies Prisma.ReviewDefaultArgs;

export type ReviewWithPanels = Prisma.ReviewGetPayload<typeof reviewWithPanels>;

export const reviewRepository = {
  findOwnReviewWithPanels(reviewerId: string, blueprintCode: string): Promise<ReviewWithPanels | null> {
    return prisma.review.findUnique({
      where: { reviewerId_blueprintCode: { reviewerId, blueprintCode } },
      ...reviewWithPanels,
    });
  },

  async upsertReviewWithPanels(input: UpsertReviewInput): Promise<ReviewWithPanels> {
    const { reviewerId, blueprintCode, intent } = input;
    return runSerializable(async (tx) => {
      const existing = await tx.review.findUnique({
        where: { reviewerId_blueprintCode: { reviewerId, blueprintCode } },
        select: { id: true, status: true, submittedAt: true },
      });
      const now = new Date();

      // Status machine (FR-024..026): submit → 已提交; autosave preserves existing (never elevates,
      // never regresses), defaulting a brand-new row to 草稿.
      const status: ReviewStatus =
        intent === 'submit' ? 'SUBMITTED' : (existing?.status ?? 'DRAFT');
      const submittedAt =
        intent === 'submit' ? (existing?.submittedAt ?? now) : (existing?.submittedAt ?? null);

      const review = await tx.review.upsert({
        where: { reviewerId_blueprintCode: { reviewerId, blueprintCode } },
        create: {
          reviewerId,
          blueprintCode,
          overallJudgement: input.overallJudgement,
          indicationJudgement: input.indicationJudgement,
          indicationNote: input.indicationNote,
          otherComment: input.otherComment,
          status,
          lastSavedAt: now,
          submittedAt,
        },
        update: {
          overallJudgement: input.overallJudgement,
          indicationJudgement: input.indicationJudgement,
          indicationNote: input.indicationNote,
          otherComment: input.otherComment,
          status,
          lastSavedAt: now,
          submittedAt,
        },
      });

      // The per-panel submit gate is evaluated HERE, inside the transaction, because it
      // depends on two facts that are only consistent together: the document being submitted
      // and the photos already persisted by their own endpoints. A reviewer can upload a photo
      // and submit before the 800ms document debounce fires, so a gate that reads only the
      // document would wrongly reject them (FR-049, research D15).
      if (intent === 'submit') {
        const counts = await tx.reviewPhoto.groupBy({
          by: ['panelIndex'],
          where: { reviewId: review.id, panelIndex: { not: null } },
          _count: { _all: true },
        });
        const photoCounts = new Map<number, number>(
          counts
            .filter((c): c is typeof c & { panelIndex: number } => c.panelIndex !== null)
            .map((c) => [c.panelIndex, c._count._all]),
        );
        const blocked = unaddressedPanels(input.panels as PanelGateInput[], photoCounts);
        // Throwing rolls the transaction back, so a blocked submit leaves no trace.
        if (blocked.length > 0) throw new AppError('PANEL_REVIEW_INCOMPLETE');
      }

      await tx.panelReview.deleteMany({ where: { reviewId: review.id } });
      await tx.panelReview.createMany({
        data: input.panels.map((p) => ({
          reviewId: review.id,
          panelIndex: p.panelIndex,
          noProblem: p.noProblem,
          requiredWarnings: p.requiredWarnings,
          warningOther: p.warningOther,
          problemTypes: p.problemTypes,
          problemNote: p.problemNote,
        })),
      });

      return tx.review.findUniqueOrThrow({ where: { id: review.id }, ...reviewWithPanels });
    });
  },

  /**
   * Resolve the Review a photo will hang off, creating it as 草稿 when none exists (FR-050).
   *
   * A photo can be the FIRST thing a reviewer saves for a blueprint, so this is a second way
   * for a Review row to come into existence besides the first autosave — which narrows the
   * older 「未開始 = no row」 definition rather than breaking it. The four PanelReview rows are
   * created alongside so the exactly-four invariant holds from the moment the row exists.
   *
   * On an existing review the status is left ALONE: a 已提交 review stays 已提交, `submittedAt`
   * is untouched, and only `lastUpdatedAt` moves (FR-051). No re-submit is ever required.
   */
  async ensureReviewForPhoto(
    reviewerId: string,
    blueprintCode: string,
  ): Promise<{ id: string; status: ReviewStatus }> {
    return runSerializable(async (tx) => {
      const existing = await tx.review.findUnique({
        where: { reviewerId_blueprintCode: { reviewerId, blueprintCode } },
        select: { id: true, status: true },
      });
      if (existing) {
        await tx.review.update({
          where: { id: existing.id },
          data: { lastUpdatedAt: new Date() },
        });
        return existing;
      }
      const created = await tx.review.create({
        data: {
          reviewerId,
          blueprintCode,
          status: 'DRAFT',
          panels: { create: [1, 2, 3, 4].map(blankPanel) },
        },
        select: { id: true, status: true },
      });
      return created;
    });
  },

  /** Refresh 最近更新時間 after a photo change, without touching status or submittedAt. */
  async touchReview(reviewerId: string, blueprintCode: string): Promise<void> {
    await prisma.review.updateMany({
      where: { reviewerId, blueprintCode },
      data: { lastUpdatedAt: new Date() },
    });
  },

  /** Delete my own review for a blueprint (panels cascade). Idempotent — no row is a no-op. */
  async deleteOwnReview(reviewerId: string, blueprintCode: string): Promise<void> {
    await prisma.review.deleteMany({ where: { reviewerId, blueprintCode } });
  },

  /** Business blueprintCode → my review status (for progress + auto-advance ordering). */
  async ownStatusByBlueprint(reviewerId: string): Promise<Map<string, ReviewStatus>> {
    const rows = await prisma.review.findMany({
      where: { reviewerId },
      select: { status: true, blueprintCode: true },
    });
    return new Map(rows.map((r) => [r.blueprintCode, r.status]));
  },

  /** Does this catalog business code exist? (existence gate for autosave/submit). */
  async blueprintExists(code: string): Promise<boolean> {
    const row = await prisma.blueprint.findUnique({ where: { blueprintId: code }, select: { id: true } });
    return row !== null;
  },

  countSubmitted(reviewerId: string): Promise<number> {
    return prisma.review.count({ where: { reviewerId, status: 'SUBMITTED' } });
  },
};
