-- Per-panel explicit "no problem" sign-off + image-level "other comment" (2026-07-01 feedback).
ALTER TABLE "PanelReview" ADD COLUMN "noProblem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN "otherComment" TEXT;
