-- AlterTable
ALTER TABLE "NewsArticle" ADD COLUMN "url" TEXT,
ADD COLUMN "aiStars" INTEGER,
ADD COLUMN "aiAnalysis" TEXT,
ADD COLUMN "aiConfidence" TEXT;

-- AlterTable
ALTER TABLE "BotConfig" ADD COLUMN "aiKeywords" TEXT NOT NULL DEFAULT '[]';
