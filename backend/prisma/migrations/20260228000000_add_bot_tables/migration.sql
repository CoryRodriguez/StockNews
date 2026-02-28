CREATE TABLE "BotTrade" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "symbol"        TEXT NOT NULL,
    "entryPrice"    DOUBLE PRECISION,
    "exitPrice"     DOUBLE PRECISION,
    "shares"        DOUBLE PRECISION,
    "pnl"           DOUBLE PRECISION,
    "catalystType"  TEXT,
    "catalystTier"  INTEGER,
    "exitReason"    TEXT,
    "status"        TEXT NOT NULL,
    "alpacaOrderId" TEXT,
    "entryAt"       TIMESTAMP(3),
    "exitAt"        TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL
);

CREATE INDEX "BotTrade_status_idx"    ON "BotTrade"("status");
CREATE INDEX "BotTrade_symbol_idx"    ON "BotTrade"("symbol");
CREATE INDEX "BotTrade_createdAt_idx" ON "BotTrade"("createdAt");

CREATE TABLE "BotConfig" (
    "id"                       TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "enabled"                  BOOLEAN NOT NULL DEFAULT false,
    "state"                    TEXT NOT NULL DEFAULT 'stopped',
    "mode"                     TEXT NOT NULL DEFAULT 'paper',
    "positionSizeUsd"          DOUBLE PRECISION NOT NULL DEFAULT 500,
    "confidenceMultiplierHigh" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "confidenceMultiplierMed"  DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "confidenceMultiplierLow"  DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "maxConcurrentPositions"   INTEGER NOT NULL DEFAULT 3,
    "dailyLossLimitUsd"        DOUBLE PRECISION NOT NULL DEFAULT 500,
    "minWinRate"               DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "hardStopLossPct"          DOUBLE PRECISION NOT NULL DEFAULT 7.0,
    "maxHoldDurationSec"       INTEGER NOT NULL DEFAULT 300,
    "enabledCatalystTiers"     TEXT NOT NULL DEFAULT '1,2,3,4',
    "maxFloatShares"           DOUBLE PRECISION NOT NULL DEFAULT 20000000,
    "maxSharePrice"            DOUBLE PRECISION NOT NULL DEFAULT 20,
    "minRelativeVolume"        DOUBLE PRECISION NOT NULL DEFAULT 5,
    "updatedAt"                TIMESTAMP(3) NOT NULL
);

CREATE TABLE "BotDailyStats" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "date"          TEXT NOT NULL,
    "realizedPnl"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tradeCount"    INTEGER NOT NULL DEFAULT 0,
    "dayTradeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "BotDailyStats_date_key" ON "BotDailyStats"("date");
