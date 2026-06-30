import type { OverallJudgement } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';

/**
 * Seed a deterministic dashboard scenario directly via Prisma (read-side tests don't need HTTP).
 * 3 active reviewers + 1 非在職; submitted reviews on S1/S2 (with disagreement on S1) + 1 draft on
 * S3 (must be excluded). One panel carries multi-select detail for the export test.
 */
const emptyPanels = () =>
  [1, 2, 3, 4].map((panelIndex) => ({ panelIndex, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null }));

export interface SeededDashboard {
  r1: string;
  r2: string;
  r3: string;
  r4: string;
}

const mkReviewer = (username: string, displayName: string, isActive: boolean) =>
  prisma.account.create({
    data: { username, displayName, role: 'REVIEWER', passwordHash: 'x', isActive },
    select: { id: true },
  });

const submit = (
  reviewerId: string,
  blueprintCode: string,
  overall: OverallJudgement,
  panels = emptyPanels(),
) =>
  prisma.review.create({
    data: {
      reviewerId,
      blueprintCode,
      status: 'SUBMITTED',
      overallJudgement: overall,
      submittedAt: new Date(),
      panels: { create: panels },
    },
  });

export const seedDashboard = async (): Promise<SeededDashboard> => {
  const [r1, r2, r3, r4] = await Promise.all([
    mkReviewer('dash_r1', '甲醫師', true),
    mkReviewer('dash_r2', '乙醫師', true),
    mkReviewer('dash_r3', '丙醫師', true),
    mkReviewer('dash_r4', '前醫師', false),
  ]);

  // S1: R1=通過, R2=需重做 (disagreement), R4(非在職)=通過. S2: R1=需小修. S3: R1 draft (excluded).
  await submit(r1.id, 'S1', 'PASS');
  await submit(r2.id, 'S1', 'REDO', [
    { panelIndex: 1, requiredWarnings: ['OSTEOPOROSIS'], warningOther: null, problemTypes: ['TYPO'], problemNote: '第1格錯字' },
    { panelIndex: 2, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null },
    { panelIndex: 3, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null },
    { panelIndex: 4, requiredWarnings: [], warningOther: null, problemTypes: [], problemNote: null },
  ]);
  await submit(r4.id, 'S1', 'PASS');
  await submit(r1.id, 'S2', 'MINOR_FIX');
  await prisma.review.create({
    data: { reviewerId: r1.id, blueprintCode: 'S3', status: 'DRAFT', overallJudgement: null, panels: { create: emptyPanels() } },
  });

  return { r1: r1.id, r2: r2.id, r3: r3.id, r4: r4.id };
};
