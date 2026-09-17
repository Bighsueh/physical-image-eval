import type { IndicationJudgement, OverallJudgement, ProblemType, WarningType } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * READ-ONLY data access for feature 004 (constitution XI, FR-012/SC-007). No write method exists.
 * At this corpus size (≤ a few dozen reviewers × a small fixed catalog) we fetch the submitted set + reviewer accounts
 * and aggregate in pure functions, rather than many groupBy round-trips.
 */
export interface ReviewerAccount {
  id: string;
  displayName: string;
  isActive: boolean;
}

export interface SubmittedPanel {
  panelIndex: number;
  requiredWarnings: WarningType[];
  warningOther: string | null;
  problemTypes: ProblemType[];
  problemNote: string | null;
}

export interface SubmittedReview {
  blueprintCode: string;
  overallJudgement: OverallJudgement | null;
  indicationJudgement: IndicationJudgement | null;
  indicationNote: string | null;
  submittedAt: Date | null;
  reviewer: ReviewerAccount;
  panels: SubmittedPanel[];
}

export const reviewReadRepository = {
  listReviewerAccounts(): Promise<ReviewerAccount[]> {
    return prisma.account.findMany({
      where: { role: 'REVIEWER' },
      select: { id: true, displayName: true, isActive: true },
      orderBy: { displayName: 'asc' },
    });
  },

  listSubmittedReviews(): Promise<SubmittedReview[]> {
    return prisma.review.findMany({
      where: { status: 'SUBMITTED' },
      select: {
        blueprintCode: true,
        overallJudgement: true,
        indicationJudgement: true,
        indicationNote: true,
        submittedAt: true,
        reviewer: { select: { id: true, displayName: true, isActive: true } },
        panels: {
          select: {
            panelIndex: true,
            requiredWarnings: true,
            warningOther: true,
            problemTypes: true,
            problemNote: true,
          },
          orderBy: { panelIndex: 'asc' },
        },
      },
    });
  },
};
