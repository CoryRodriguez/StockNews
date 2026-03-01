-- Phase 7: DailyRecap model + BotSignalLog.postRejectPeakPct + BotTrade enrichment fields

-- Add postRejectPeakPct to BotSignalLog
ALTER TABLE "BotSignalLog" ADD COLUMN "postRejectPeakPct" DOUBLE PRECISION;

-- Add enrichment fields to BotTrade
ALTER TABLE "BotTrade" ADD COLUMN "entryVwapDev" DOUBLE PRECISION;
ALTER TABLE "BotTrade" ADD COLUMN "peakPrice" DOUBLE PRECISION;
ALTER TABLE "BotTrade" ADD COLUMN "maxDrawdownPct" DOUBLE PRECISION;

-- Create DailyRecap table
CREATE TABLE "DailyRecap" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "totalPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "winCount" INTEGER NOT NULL DEFAULT 0,
    "lossCount" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "firedCount" INTEGER NOT NULL DEFAULT 0,
    "bestTradePnl" DOUBLE PRECISION,
    "worstTradePnl" DOUBLE PRECISION,
    "spyChangePct" DOUBLE PRECISION,
    "qqqChangePct" DOUBLE PRECISION,
    "sectionsJson" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRecap_pkey" PRIMARY KEY ("id")
);

-- Unique and index on date
CREATE UNIQUE INDEX "DailyRecap_date_key" ON "DailyRecap"("date");
CREATE INDEX "DailyRecap_date_idx" ON "DailyRecap"("date");
