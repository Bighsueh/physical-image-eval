-- Review-domain hardening (003 review findings):
-- 1. Drop the redundant single-column index (covered by the unique + [reviewerId,status] indexes).
-- 2. Defense-in-depth CHECK constraints mirroring the application/zod validation.
DROP INDEX IF EXISTS "Review_reviewerId_idx";

ALTER TABLE "Review" ADD CONSTRAINT "chk_review_blueprint_code_format"
  CHECK ("blueprintCode" ~ '^[SHETPKLY][1-9][0-9]?$');

ALTER TABLE "PanelReview" ADD CONSTRAINT "chk_panel_review_index_range"
  CHECK ("panelIndex" BETWEEN 1 AND 4);
