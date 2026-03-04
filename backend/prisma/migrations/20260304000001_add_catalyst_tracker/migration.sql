-- CreateTable
CREATE TABLE "KeywordHit" (
    "id" TEXT NOT NULL,
    "articleId" INTEGER NOT NULL,
    "ticker" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "matchedKeyword" TEXT,
    "catalystCategory" TEXT,
    "catalystTier" INTEGER,
    "aiStars" INTEGER NOT NULL,
    "aiAnalysis" TEXT NOT NULL,
    "aiConfidence" TEXT NOT NULL,
    "priceAtNews" DOUBLE PRECISION,
    "price1h" DOUBLE PRECISION,
    "price4h" DOUBLE PRECISION,
    "priceEod" DOUBLE PRECISION,
    "return1hPct" DOUBLE PRECISION,
    "return4hPct" DOUBLE PRECISION,
    "returnEodPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserArticle" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "notes" TEXT,
    "aiStars" INTEGER,
    "aiAnalysis" TEXT,
    "aiConfidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMoverAnalysis" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "moversJson" JSONB NOT NULL,
    "trendingKeywords" JSONB NOT NULL,
    "aiSummary" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyMoverAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeywordHit_ticker_idx" ON "KeywordHit"("ticker");

-- CreateIndex
CREATE INDEX "KeywordHit_catalystCategory_idx" ON "KeywordHit"("catalystCategory");

-- CreateIndex
CREATE INDEX "KeywordHit_createdAt_idx" ON "KeywordHit"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMoverAnalysis_date_key" ON "DailyMoverAnalysis"("date");
