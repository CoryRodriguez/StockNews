---
phase: 03-trade-executor-and-position-monitor
plan: "04"
subsystem: trading-bot-integration
tags: [signal-engine, bot-controller, startup-wiring, reconciliation, trade-executor, position-monitor]

# Dependency graph
requires:
  - phase: 03-trade-executor-and-position-monitor
    plan: "02"
    provides: tradeExecutor.ts (executeTradeAsync), tradingWs.ts (startTradingWs, restartTradingWs)
  - phase: 03-trade-executor-and-position-monitor
    plan: "03"
    provides: positionMonitor.ts (startPositionMonitor, addPosition)
  - phase: 01-bot-infrastructure-foundation
    provides: botController.ts (reconcilePositions, initBot, switchMode)
provides:
  - signalEngine.ts — fires real orders (executeTradeAsync) on outcome=fired (replaces log-only)
  - botController.ts — reconcilePositions with orphan import + addPosition hydration; switchMode restarts tradingWs
  - index.ts — startup wiring: startTradingWs + startPositionMonitor after initBot
affects: [phase-4-risk-management, phase-5-frontend-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget executor call: void executeTradeAsync(signal).catch(err => console.error) in signal engine"
    - "Orphan position import: Alpaca positions missing from DB get BotTrade created + addPosition() called"
    - "Startup hydration: existing DB open trades warm positionMonitor via addPosition() in reconcilePositions()"
    - "Mode-aware WebSocket restart: switchMode() calls restartTradingWs() after URL changes"
    - "Startup sequence: loadStrategiesFromDb → recomputeStrategies → initBot → startTradingWs → startPositionMonitor"

key-files:
  created: []
  modified:
    - backend/src/services/signalEngine.ts
    - backend/src/services/botController.ts
    - backend/src/index.ts

key-decisions:
  - "void executeTradeAsync().catch() in signalEngine — fire-and-forget, never blocks news handler (EXEC-06)"
  - "rejectReason changed from 'log-only' to null in both fired writeSignalLog calls — signal is actually fired now"
  - "reconcilePositions() builds liveMap (symbol→AlpacaPositionFull) for O(1) lookup during DB trade iteration"
  - "Orphan import creates BotTrade with catalystType='unknown', catalystTier=null — position is tracked even without signal context"
  - "addPosition() called for both DB-open trades (startup hydration) and orphan imports — single code path for monitor warmup"
  - "restartTradingWs() called at end of switchMode() — ensures trading WS reconnects to correct URL immediately"
  - "startTradingWs() and startPositionMonitor() called after initBot() — reconciliation runs first, then monitor is already warm"

requirements-completed: [EXEC-01, EXEC-06]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 3 Plan 04: Integration Wiring Summary

**Final integration wiring — signalEngine fires real orders via executeTradeAsync, botController reconciliation hydrates positionMonitor on startup, index.ts calls startTradingWs + startPositionMonitor after initBot**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-28T19:41:12Z
- **Completed:** 2026-02-28T19:44:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Replaced Phase 2 "log-only" placeholder in signalEngine.ts with real `void executeTradeAsync(signal).catch(...)` calls — both tier 1-2 and AI-approved tier 3-4 fired paths updated
- All "log-only" strings removed from signalEngine.ts (zero occurrences remain)
- Extended `reconcilePositions()` in botController.ts with orphan import logic: Alpaca positions not in DB get a new BotTrade created and are added to the position monitor
- Extended `reconcilePositions()` to hydrate the position monitor for existing DB open trades (startup warmup)
- Added `restartTradingWs()` call to `switchMode()` — trading WebSocket reconnects to correct URL on mode change
- Added four missing BotConfig defaults to `initBot()` create block: `tradeSizeStars3=50`, `tradeSizeStars4=75`, `tradeSizeStars5=100`, `profitTargetPct=10`
- Wired `startTradingWs()` and `startPositionMonitor()` into server startup sequence in index.ts after `initBot()`
- All TypeScript compiles clean (tsc --noEmit: zero errors)
- All 6 plan verification checks pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Update signalEngine.ts — replace log-only with executeTradeAsync call** - `d08b25b` (feat)
2. **Task 2: Update botController.ts and index.ts — reconciliation, mode switch, startup wiring** - `475d515` (feat)

## Files Created/Modified

- `backend/src/services/signalEngine.ts` — Added import for executeTradeAsync; both fired branches (tier 1-2 and tier 3-4 AI-approved) now call void executeTradeAsync().catch(); rejectReason set to null (was "log-only")
- `backend/src/services/botController.ts` — Added imports for addPosition + restartTradingWs; reconcilePositions() overhauled with orphan import + startup hydration; initBot() create block gains 4 new BotConfig defaults; switchMode() calls restartTradingWs()
- `backend/src/index.ts` — Added imports for startTradingWs + startPositionMonitor; both called in server.listen callback after initBot()

## Decisions Made

- `void executeTradeAsync(signal).catch(err => console.error(...))` is the exact pattern — fire-and-forget ensures the news handler is never blocked waiting for order placement (EXEC-06)
- `rejectReason: null` (not "log-only") in both fired `writeSignalLog` calls — the signal is genuinely fired now, not just logged
- `reconcilePositions()` builds a `Map<string, AlpacaPositionFull>` for O(1) lookups when iterating DB trades
- Orphan Alpaca positions (no matching BotTrade) get a `BotTrade` created with `catalystType: 'unknown'` and are immediately added to the position monitor so they can exit cleanly
- `addPosition()` is called for both the orphan import case and the existing DB-open case — same warmup flow, different data source
- `startTradingWs()` called before `startPositionMonitor()` — ensures the trading stream is already connecting when the monitor starts its first poll cycle
- `reconcilePositions()` try/catch wrapper preserved — server startup remains non-fatal even if Alpaca is unreachable

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

All 6 checks from the plan's `<verification>` block pass:

1. `tsc --noEmit` — zero errors across all three modified files
2. `grep -c "log-only" signalEngine.ts` — outputs 0 (no occurrences)
3. `grep "executeTradeAsync" signalEngine.ts` — finds import + two void calls (lines 25, 481, 566)
4. `grep "addPosition|restartTradingWs" botController.ts` — finds imports + 2 addPosition calls + 1 restartTradingWs call
5. `grep "startTradingWs|startPositionMonitor" index.ts` — finds imports + both startup calls
6. `grep "tradeSizeStars3|profitTargetPct" botController.ts` — finds both in BotConfigRecord interface and in create block

## Phase 3 Status

Phase 3 is now functionally complete for paper trading:
- Plan 03-01: BotConfig schema fields (tradeSizeStars3/4/5, profitTargetPct)
- Plan 03-02: tradeExecutor.ts + tradingWs.ts
- Plan 03-03: positionMonitor.ts (5s exit loop, EOD cron)
- Plan 03-04 (this plan): Integration wiring — all three new services connected into the live codebase

The bot now runs end-to-end: news article → evaluateBotSignal → executeTradeAsync → BotTrade → positionMonitor exit loop → sell order.

## Self-Check: PASSED

- FOUND: backend/src/services/signalEngine.ts
- FOUND: backend/src/services/botController.ts
- FOUND: backend/src/index.ts
- FOUND commit d08b25b: feat(03-04): wire signalEngine.ts — replace log-only with executeTradeAsync
- FOUND commit 475d515: feat(03-04): wire botController + index.ts — reconciliation, mode switch, startup

---
*Phase: 03-trade-executor-and-position-monitor*
*Completed: 2026-02-28*
