-- CreateTable
CREATE TABLE "BotSignalLog" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "catalystCategory" TEXT,
    "catalystTier" INTEGER,
    "outcome" TEXT NOT NULL,
    "rejectReason" TEXT,
    "failedPillar" TEXT,
    "aiProceed" BOOLEAN,
    "aiConfidence" TEXT,
    "aiReasoning" TEXT,
    "winRateAtEval" DOUBLE PRECISION,
    "priceAtEval" DOUBLE PRECISION,
    "relVolAtEval" DOUBLE PRECISION,
    "articleCreatedAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotSignalLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotSignalLog_symbol_idx" ON "BotSignalLog"("symbol");

-- CreateIndex
CREATE INDEX "BotSignalLog_outcome_idx" ON "BotSignalLog"("outcome");

-- CreateIndex
CREATE INDEX "BotSignalLog_evaluatedAt_idx" ON "BotSignalLog"("evaluatedAt");
