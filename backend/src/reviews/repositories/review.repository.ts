import {
  Prisma,
  type IndicationJudgement,
  type OverallJudgement,
  type ProblemType,
  type ReviewStatus,
  type WarningType,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

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
  panels: PanelWrite[];
  intent: 'autosave' | 'submit';
}

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
          status,
          lastSavedAt: now,
          submittedAt,
        },
        update: {
          overallJudgement: input.overallJudgement,
          indicationJudgement: input.indicationJudgement,
          indicationNote: input.indicationNote,
          status,
          lastSavedAt: now,
          submittedAt,
        },
      });

      await tx.panelReview.deleteMany({ where: { reviewId: review.id } });
      await tx.panelReview.createMany({
        data: input.panels.map((p) => ({
          reviewId: review.id,
          panelIndex: p.panelIndex,
          requiredWarnings: p.requiredWarnings,
          warningOther: p.warningOther,
          problemTypes: p.problemTypes,
          problemNote: p.problemNote,
        })),
      });

      return tx.review.findUniqueOrThrow({ where: { id: review.id }, ...reviewWithPanels });
    });
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
