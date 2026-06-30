-- Review references the blueprint by BUSINESS CODE (no FK to Blueprint.id), so catalog
-- re-ingestion (which deletes+recreates all Blueprint rows) never breaks/deletes review data.
-- Review tables are empty at this point, so the column swap is non-destructive in practice.
ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_blueprintId_fkey";
DROP INDEX IF EXISTS "Review_blueprintId_idx";
DROP INDEX IF EXISTS "Review_reviewerId_blueprintId_key";
ALTER TABLE "Review" DROP COLUMN IF EXISTS "blueprintId";
ALTER TABLE "Review" ADD COLUMN "blueprintCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Review" ALTER COLUMN "blueprintCode" DROP DEFAULT;
CREATE UNIQUE INDEX "Review_reviewerId_blueprintCode_key" ON "Review"("reviewerId", "blueprintCode");
CREATE INDEX "Review_blueprintCode_idx" ON "Review"("blueprintCode");
