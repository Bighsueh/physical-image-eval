-- CreateTable
CREATE TABLE "ReviewPhoto" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "panelIndex" INTEGER,
    "caption" TEXT,
    "originalMimeType" TEXT NOT NULL,
    "originalByteSize" INTEGER NOT NULL,
    "displayByteSize" INTEGER NOT NULL,
    "annotatedByteSize" INTEGER,
    "annotationState" JSONB,
    "annotatedAt" TIMESTAMPTZ(6),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ReviewPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewPhotoBlob" (
    "photoId" TEXT NOT NULL,
    "original" BYTEA NOT NULL,
    "display" BYTEA NOT NULL,
    "annotated" BYTEA,
    "originalAsJpeg" BYTEA,

    CONSTRAINT "ReviewPhotoBlob_pkey" PRIMARY KEY ("photoId")
);

-- CreateIndex
CREATE INDEX "ReviewPhoto_reviewId_panelIndex_sortOrder_idx" ON "ReviewPhoto"("reviewId", "panelIndex", "sortOrder");

-- AddForeignKey
ALTER TABLE "ReviewPhoto" ADD CONSTRAINT "ReviewPhoto_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewPhotoBlob" ADD CONSTRAINT "ReviewPhotoBlob_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "ReviewPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense-in-depth, mirroring the zod boundary (data-model.md): a photo belongs to one of the
-- four panels, or to the image as a whole (NULL). Nothing else is representable.
ALTER TABLE "ReviewPhoto"
  ADD CONSTRAINT "ReviewPhoto_panelIndex_range"
  CHECK ("panelIndex" IS NULL OR ("panelIndex" >= 1 AND "panelIndex" <= 4));
