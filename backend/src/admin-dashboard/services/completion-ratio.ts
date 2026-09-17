/**
 * Active-basis completion ratio (FR-002/016/022). The denominator is activeReviewers × catalog
 * size and the numerator counts only active reviewers' submitted records — so the percent can never
 * exceed 100, and 非在職 submissions never enter it. Denominator 0 ⇒ 0 (no division).
 */
export const completionPercent = (submittedActive: number, expectedSubmissions: number): number => {
  if (expectedSubmissions <= 0) return 0;
  const pct = (submittedActive / expectedSubmissions) * 100;
  return Math.min(100, Math.round(pct * 10) / 10); // one decimal place, capped at 100
};
