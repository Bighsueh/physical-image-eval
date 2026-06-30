-- CreateEnum
CREATE TYPE "RegionCode" AS ENUM ('S', 'H', 'E', 'T', 'P', 'K', 'L', 'Y');

-- CreateEnum
CREATE TYPE "MappingKind" AS ENUM ('MAPPED', 'TEMPLATE', 'REFERRAL');

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "regionCode" "RegionCode" NOT NULL,
    "nameZh" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blueprint" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "indications" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "gentleReminder" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "sourceMarkdownRef" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "isHighRisk" BOOLEAN NOT NULL DEFAULT false,
    "aiPrompt" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Blueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Panel" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "panelIndex" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "actionDescription" TEXT NOT NULL,
    "timingHint" TEXT,
    "visualDescription" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Panel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "matrixNo" INTEGER NOT NULL,
    "nameZh" TEXT NOT NULL,
    "mappingKind" "MappingKind" NOT NULL,
    "mappedBlueprintId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_regionCode_key" ON "Region"("regionCode");

-- CreateIndex
CREATE UNIQUE INDEX "Region_displayOrder_key" ON "Region"("displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Blueprint_blueprintId_key" ON "Blueprint"("blueprintId");

-- CreateIndex
CREATE UNIQUE INDEX "Blueprint_imagePath_key" ON "Blueprint"("imagePath");

-- CreateIndex
CREATE INDEX "Blueprint_regionId_idx" ON "Blueprint"("regionId");

-- CreateIndex
CREATE INDEX "Blueprint_isHighRisk_idx" ON "Blueprint"("isHighRisk");

-- CreateIndex
CREATE UNIQUE INDEX "Panel_blueprintId_panelIndex_key" ON "Panel"("blueprintId", "panelIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Diagnosis_matrixNo_key" ON "Diagnosis"("matrixNo");

-- CreateIndex
CREATE INDEX "Diagnosis_mappedBlueprintId_idx" ON "Diagnosis"("mappedBlueprintId");

-- AddForeignKey
ALTER TABLE "Blueprint" ADD CONSTRAINT "Blueprint_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Panel" ADD CONSTRAINT "Panel_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_mappedBlueprintId_fkey" FOREIGN KEY ("mappedBlueprintId") REFERENCES "Blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
