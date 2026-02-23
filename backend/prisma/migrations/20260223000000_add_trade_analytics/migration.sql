-- AlterTable: add analytics relation to PaperTrade (no column changes needed)

-- CreateTable: TradeAnalytics
CREATE TABLE "TradeAnalytics" (
    "id" TEXT NOT NULL,
    "paperTradeId" TEXT NOT NULL,
    "newsHeadline" TEXT NOT NULL,
    "newsBody" TEXT NOT NULL,
    "newsSource" TEXT NOT NULL DEFAULT 'rtpr',
    "catalystCategory" TEXT NOT NULL,
    "catalystTier" INTEGER NOT NULL,
    "newsPublishedAt" TIMESTAMP(3) NOT NULL,
    "newsDetectedAt" TIMESTAMP(3) NOT NULL,
    "tradeEnteredAt" TIMESTAMP(3) NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "entryVolume" INTEGER NOT NULL,
    "avgVolume30d" DOUBLE PRECISION NOT NULL,
    "relativeVolume" DOUBLE PRECISION NOT NULL,
    "marketCap" DOUBLE PRECISION,
    "floatShares" DOUBLE PRECISION,
    "sector" TEXT,
    "isPreMarket" BOOLEAN NOT NULL DEFAULT false,
    "peakPrice" DOUBLE PRECISION,
    "peakTimeOffsetSec" INTEGER,
    "troughAfterPeak" DOUBLE PRECISION,
    "maxDrawdownPct" DOUBLE PRECISION,
    "actualHoldSec" INTEGER,
    "exitPrice" DOUBLE PRECISION,
    "returnPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PriceSnapshot
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "tradeAnalyticsId" TEXT NOT NULL,
    "offsetSeconds" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "volume" INTEGER NOT NULL,
    "returnPct" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StrategyRule
CREATE TABLE "StrategyRule" (
    "id" TEXT NOT NULL,
    "catalystCategory" TEXT NOT NULL,
    "capBucket" TEXT NOT NULL DEFAULT 'ALL',
    "todBucket" TEXT NOT NULL DEFAULT 'ALL',
    "holdDurationSec" INTEGER NOT NULL,
    "trailingStopPct" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "avgReturnPct" DOUBLE PRECISION NOT NULL,
    "medianReturnPct" DOUBLE PRECISION NOT NULL,
    "winRate" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: TradeAnalytics unique on paperTradeId
CREATE UNIQUE INDEX "TradeAnalytics_paperTradeId_key" ON "TradeAnalytics"("paperTradeId");

-- CreateIndex: PriceSnapshot unique on (tradeAnalyticsId, offsetSeconds)
CREATE UNIQUE INDEX "PriceSnapshot_tradeAnalyticsId_offsetSeconds_key" ON "PriceSnapshot"("tradeAnalyticsId", "offsetSeconds");

-- CreateIndex: StrategyRule unique on (catalystCategory, capBucket, todBucket)
CREATE UNIQUE INDEX "StrategyRule_catalystCategory_capBucket_todBucket_key" ON "StrategyRule"("catalystCategory", "capBucket", "todBucket");

-- AddForeignKey: TradeAnalytics → PaperTrade
ALTER TABLE "TradeAnalytics" ADD CONSTRAINT "TradeAnalytics_paperTradeId_fkey"
    FOREIGN KEY ("paperTradeId") REFERENCES "PaperTrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: PriceSnapshot → TradeAnalytics
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_tradeAnalyticsId_fkey"
    FOREIGN KEY ("tradeAnalyticsId") REFERENCES "TradeAnalytics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
