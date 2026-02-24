-- Add VWAP deviation tracking fields
-- entryVwapDev: (entryPrice - sessionVwap) / sessionVwap * 100 at trade entry
-- vwapDev:     (price - sessionVwap) / sessionVwap * 100 at each price snapshot

ALTER TABLE "TradeAnalytics" ADD COLUMN "entryVwapDev" DOUBLE PRECISION;

ALTER TABLE "PriceSnapshot" ADD COLUMN "vwapDev" DOUBLE PRECISION;
