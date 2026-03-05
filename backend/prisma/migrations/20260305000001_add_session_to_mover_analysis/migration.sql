-- Add session column to DailyMoverAnalysis (premarket/market/postmarket)
ALTER TABLE "DailyMoverAnalysis" ADD COLUMN "session" TEXT NOT NULL DEFAULT 'market';

-- Drop the old unique constraint on date alone
ALTER TABLE "DailyMoverAnalysis" DROP CONSTRAINT IF EXISTS "DailyMoverAnalysis_date_key";

-- Create compound unique on (date, session)
ALTER TABLE "DailyMoverAnalysis" ADD CONSTRAINT "DailyMoverAnalysis_date_session_key" UNIQUE ("date", "session");
