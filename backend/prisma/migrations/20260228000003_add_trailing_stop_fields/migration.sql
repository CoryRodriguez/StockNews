-- Migration: add trailingStopPct and trailingStopDollar to BotConfig for EXIT-02 trailing stop
-- Default 0 = disabled; pct takes precedence over dollar when both > 0

ALTER TABLE "BotConfig" ADD COLUMN IF NOT EXISTS "trailingStopPct"    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "BotConfig" ADD COLUMN IF NOT EXISTS "trailingStopDollar" DOUBLE PRECISION NOT NULL DEFAULT 0;
