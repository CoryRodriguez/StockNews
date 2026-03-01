---
phase: 07-end-of-day-recap-evaluation-framework
plan: "01"
subsystem: database-schema + backend-services
tags: [prisma, schema, missed-opportunity, enrichment, position-monitor, trade-executor, signal-engine]
dependency_graph:
  requires: []
  provides:
    - DailyRecap Prisma model (all Phase 7 plans depend on this)
    - BotSignalLog.postRejectPeakPct field
    - BotTrade.entryVwapDev / peakPrice / maxDrawdownPct fields
    - missedOpportunityTracker.ts service
  affects:
    - backend/prisma/schema.prisma
    - backend/src/services/signalEngine.ts
    - backend/src/services/positionMonitor.ts
    - backend/src/services/tradeExecutor.ts
    - backend/src/services/botController.ts
tech_stack:
  added: []
  patterns:
    - Single shared polling interval for batched Alpaca getSnapshots (mirrors positionMonitor pattern)
    - Fire-and-forget VWAP capture after trade creation
    - Leaf service pattern (no upstream service imports in missedOpportunityTracker)
key_files:
  created:
    - backend/src/services/missedOpportunityTracker.ts
    - backend/prisma/migrations/20260301000001_phase7_recap/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/src/services/signalEngine.ts
    - backend/src/services/positionMonitor.ts
    - backend/src/services/tradeExecutor.ts
    - backend/src/services/botController.ts
decisions:
  - "Tracker uses ticker (not symbol) for Snapshot priceMap lookup — matches Snapshot interface in alpaca.ts"
  - "minPrice initialized to entryPrice in addPosition (all callers updated in botController.ts)"
  - "startMissedOpportunityWatch passes price=0 for pre-price rejections (Steps 3,4,6,7,8,9) — tracker silently skips these"
  - "entryVwapDev captured fire-and-forget after BotTrade creation — failure is non-fatal"
metrics:
  duration_seconds: 381
  completed_date: "2026-03-01"
  tasks_completed: 2
  files_modified: 5
  files_created: 2
---

# Phase 7 Plan 01: Data Foundation — Schema Migration + Missed-Opp Tracker + BotTrade Enrichment Summary

**One-liner:** Phase 7 data foundation: DailyRecap model, missed-opportunity 30-min price watcher, and BotTrade peak/VWAP enrichment writes using batched Alpaca polling.

## What Was Built

### Task 1: Prisma Schema Migration

Added three sets of new fields/models to `backend/prisma/schema.prisma`:

1. **BotSignalLog.postRejectPeakPct** (`Float?`) — stores the peak % move in the 30 minutes after rejection; written by the missed-opportunity tracker when peak >= 5%

2. **BotTrade enrichment fields:**
   - `entryVwapDev Float?` — VWAP deviation at entry time
   - `peakPrice Float?` — highest price reached during position hold
   - `maxDrawdownPct Float?` — maximum drawdown % from entry price during hold

3. **DailyRecap model** — 14 scalar columns (totalPnl, tradeCount, winCount, lossCount, winRate, score, signalCount, firedCount, bestTradePnl, worstTradePnl, spyChangePct, qqqChangePct) + `sectionsJson Json` field for deep-dive data. Unique constraint + index on `date` string ("YYYY-MM-DD" ET format).

Migration SQL at `backend/prisma/migrations/20260301000001_phase7_recap/migration.sql` — applies all 4 ALTER TABLE + CREATE TABLE + CREATE INDEX statements.

### Task 2: Services

**`missedOpportunityTracker.ts`** — new leaf service (no upstream service imports):
- Single `setInterval(60s)` shared across all active watches (batches all symbols into one `getSnapshots` call)
- `MAX_CONCURRENT_WATCHES = 50` cap prevents memory growth on high-volume days
- 30-minute watch window; writes `postRejectPeakPct` to DB only when peak >= 5%
- `startMissedOpportunityWatch(signalLogId, symbol, priceAtRejection)` exported

**`signalEngine.ts`** wiring:
- Import added: `startMissedOpportunityWatch from './missedOpportunityTracker'`
- All 12 non-silent rejection paths (Steps 3, 4, 6a, 6b, 7, 8, 9, 10a, 10b, 10c, 10.5, 10.6, 11a, 11b) now call `startMissedOpportunityWatch` after `writeSignalLog`
- Rejections before price is fetched (Steps 3-9) pass `priceAtRejection=0` — tracker silently skips these
- Rejections after snapshot (Steps 10-11) pass `snap.price` or `priceAtEval`

**`positionMonitor.ts`** enrichment:
- `minPrice: number` added to `TrackedPosition` interface
- `checkExitConditions` updates `pos.minPrice` alongside `pos.peakPrice` on every poll cycle
- `closePosition` now writes `peakPrice` and `maxDrawdownPct` in the same DB update as close data

**`tradeExecutor.ts`** VWAP capture:
- `getVwapDev` import added from `./alpaca`
- After `prisma.botTrade.create`, fire-and-forget `getVwapDev(symbol, priceAtSignal)` that updates `entryVwapDev` — both `.catch()` chains are silent (non-fatal)

**`botController.ts`** — both `addPosition` calls updated to include `minPrice: entryPrice` (required by updated `TrackedPosition` interface).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Snapshot property name is `ticker` not `symbol`**
- **Found during:** Task 2 (tsc --noEmit check)
- **Issue:** The plan's interface comment showed `s.symbol` but the actual `Snapshot` interface in `alpaca.ts` exports `ticker: string` — TypeScript error TS2339
- **Fix:** Changed `priceMap = new Map(snaps.map(s => [s.symbol, s.price]))` to `s.ticker` in `missedOpportunityTracker.ts`
- **Files modified:** `backend/src/services/missedOpportunityTracker.ts`
- **Commit:** dcb9e48

**2. [Rule 2 - Missing critical functionality] minPrice required in botController.ts addPosition calls**
- **Found during:** Task 2 (adding minPrice to TrackedPosition interface)
- **Issue:** The `Omit<TrackedPosition, 'sold'>` type now includes `minPrice`; both `addPosition` call sites in `botController.ts` were missing the field
- **Fix:** Added `minPrice: trade.entryPrice ?? 0` and `minPrice: parseFloat(livePos.avg_entry_price)` to both reconciliation `addPosition` calls
- **Files modified:** `backend/src/services/botController.ts`
- **Commit:** dcb9e48

## Verification Results

```
npx prisma validate → "The schema at prisma/schema.prisma is valid"
npx tsc --noEmit    → zero errors
grep postRejectPeakPct backend/prisma/schema.prisma → line 254: field found
grep "model DailyRecap" backend/prisma/schema.prisma → line 263: model found
grep startMissedOpportunityWatch backend/src/services/signalEngine.ts → import + 12 wiring calls
grep peakPrice backend/src/services/positionMonitor.ts → TrackedPosition field + closePosition write
grep entryVwapDev backend/src/services/tradeExecutor.ts → fire-and-forget update found
```

## Commits

| Task | Hash | Description |
|------|------|-------------|
| Task 1 | 7bbde45 | feat(07-01): Prisma schema migration — DailyRecap + BotSignalLog.postRejectPeakPct + BotTrade enrichment |
| Task 2 | dcb9e48 | feat(07-01): missed-opportunity tracker + signalEngine wiring + BotTrade enrichment |

## Self-Check

Checking files exist and commits are present...

## Self-Check: PASSED

- FOUND: backend/src/services/missedOpportunityTracker.ts
- FOUND: backend/prisma/migrations/20260301000001_phase7_recap/migration.sql
- FOUND: commit 7bbde45 (schema migration)
- FOUND: commit dcb9e48 (services)
