-- CreateEnum
CREATE TYPE "OverallJudgement" AS ENUM ('通過', '需小修', '需重做');

-- CreateEnum
CREATE TYPE "IndicationJudgement" AS ENUM ('合理', '有疑慮');

-- CreateEnum
CREATE TYPE "WarningType" AS ENUM ('注意跌倒', '需有專人幫助指導', '骨鬆注意', '心肺功能不全者注意', '其它');

-- CreateEnum
CREATE TYPE "ProblemType" AS ENUM ('部位／主題錯誤', '動作示範錯誤', '文字說明錯誤', '次數／時間不合理', '缺安全提醒', '有錯字');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('草稿', '已提交');

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "overallJudgement" "OverallJudgement",
    "indicationJudgement" "IndicationJudgement",
    "indicationNote" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT '草稿',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSavedAt" TIMESTAMPTZ(6),
    "submittedAt" TIMESTAMPTZ(6),
    "lastUpdatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelReview" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "panelIndex" INTEGER NOT NULL,
    "requiredWarnings" "WarningType"[] DEFAULT ARRAY[]::"WarningType"[],
    "warningOther" TEXT,
    "problemTypes" "ProblemType"[] DEFAULT ARRAY[]::"ProblemType"[],
    "problemNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanelReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_reviewerId_idx" ON "Review"("reviewerId");

-- CreateIndex
CREATE INDEX "Review_reviewerId_status_idx" ON "Review"("reviewerId", "status");

-- CreateIndex
CREATE INDEX "Review_blueprintId_idx" ON "Review"("blueprintId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_reviewerId_blueprintId_key" ON "Review"("reviewerId", "blueprintId");

-- CreateIndex
CREATE UNIQUE INDEX "PanelReview_reviewId_panelIndex_key" ON "PanelReview"("reviewId", "panelIndex");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelReview" ADD CONSTRAINT "PanelReview_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
