---
phase: 07-end-of-day-recap-evaluation-framework
plan: 02
subsystem: api
tags: [eod-recap, scoring, node-cron, prisma, websocket, typescript]

# Dependency graph
requires:
  - phase: 07-01
    provides: DailyRecap Prisma model, BotTrade enrichment fields (entryVwapDev, peakPrice, maxDrawdownPct), BotSignalLog.postRejectPeakPct
  - phase: 01-03
    provides: bot.ts Express router with requireAuth middleware
  - phase: 03-03
    provides: node-cron installed, positionMonitor cron pattern established
  - phase: 05-01
    provides: clientHub.ts broadcast() for WebSocket channel publishing

provides:
  - computeRecap(dateET): full DailyRecapData from 5 parallel data sources
  - persistRecap(dateET): upserts to DailyRecap table with scalar columns + sectionsJson
  - scheduleRecapCron(): 4:01 PM ET weekday cron that persists and broadcasts recap_ready
  - GET /api/bot/recap?date=YYYY-MM-DD: persisted-first, on-demand fallback
  - GET /api/bot/recap/history?mode=week|month&anchor=YYYY-MM-DD: date range query

affects:
  - 07-03 (frontend recap tab consumes GET /api/bot/recap and recap_ready WS event)
  - 07-04 (full recap page consumes all sections of DailyRecapData)
  - 07-05 (verification suite tests these endpoints)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "computeRecap uses Promise.all for 5 parallel queries (trades, signals, stats, strategies, snapshots)"
    - "cronScheduled boolean guard prevents duplicate cron registration on multiple scheduleRecapCron() calls"
    - "persistRecap upserts DailyRecap with sectionsJson cast as Prisma.InputJsonValue"
    - "Recap routes: /recap/history registered before /recap to avoid Express path shadowing"
    - "startOfDayET uses T05:00:00Z as conservative EST approximation; endOfDayET adds 24h"

key-files:
  created:
    - backend/src/services/eodRecap.ts
  modified:
    - backend/src/routes/bot.ts
    - backend/src/index.ts

key-decisions:
  - "exitAt (not createdAt) used to filter closed trades — captures trades that closed on the same calendar day even if opened the prior session"
  - "strategyLookup prefers ALL/ALL-bucket StrategyRule for simplicity; falls back to any matching category rule"
  - "dailyLossLimitHit approximated from dailyStats.realizedPnl < -$200 (no explicit flag in schema)"
  - "onTargetCount incremented for trades without recommendedHoldSec (no StrategyRule exists for catalyst) to avoid penalizing score for unconfigured catalysts"
  - "getTodayDateET imported into bot.ts from botController to avoid inline ET date calculation in routes"

patterns-established:
  - "EOD cron pattern: cronScheduled guard + node-cron schedule with America/New_York timezone option"
  - "Persisted-first REST: check DB row exists before expensive computation (recap and history endpoints)"

requirements-completed:
  - RECAP-COMPUTATION
  - RECAP-SCORING
  - RECAP-SUGGESTIONS
  - RECAP-BENCHMARKS
  - RECAP-ADHERENCE
  - RECAP-CATALYST
  - RECAP-PERSIST
  - RECAP-API
  - RECAP-BADGE

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 7 Plan 02: EOD Recap Computation Service Summary

**eodRecap.ts with 0-100 composite scoring, rule-based suggestions, and 4:01 PM ET persistence cron exposing full DailyRecapData via two REST endpoints**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T21:25:00Z
- **Completed:** 2026-03-01T21:28:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- computeRecap() queries 5 data sources in parallel (BotTrade by exitAt, BotSignalLog, BotDailyStats, StrategyRule, SPY/QQQ snapshots) and assembles a full DailyRecapData with summary, trades, signals, catalysts, adherence, suggestions, and benchmarks
- computeScore() implements a 0-100 weighted composite: P&L 30%, win rate 25%, signal quality 20%, risk compliance 15%, strategy adherence 10%
- generateSuggestions() produces up to 3 rule-based coaching messages covering missed opportunity patterns, catalyst strength/weakness, and exit behavior
- persistRecap() upserts scalar columns + sectionsJson to DailyRecap table; scheduleRecapCron() fires at 4:01 PM ET weekdays and broadcasts recap_ready on the 'bot' WebSocket channel
- GET /api/bot/recap returns persisted row instantly or falls back to on-demand computation; GET /api/bot/recap/history returns week or month date ranges

## Task Commits

Each task was committed atomically:

1. **Task 1: eodRecap.ts computation service** - `7ac07d9` (feat)
2. **Task 2: REST endpoints + scheduleRecapCron wiring** - `95ea4e8` (feat)

## Files Created/Modified

- `backend/src/services/eodRecap.ts` — Full recap computation service: interfaces, computeRecap, persistRecap, scheduleRecapCron, helper functions (scoring, suggestions, self-averages, date helpers)
- `backend/src/routes/bot.ts` — Added GET /api/bot/recap and GET /api/bot/recap/history routes with getWeekDates/getMonthDates helpers; imports computeRecap and getTodayDateET
- `backend/src/index.ts` — Imports scheduleRecapCron, calls it after startPositionMonitor() in server.listen callback

## Decisions Made

- exitAt (not createdAt) used to filter closed trades — aligns with RESEARCH.md Pitfall 1 guidance
- StrategyRule lookup uses ALL/ALL-bucket preference for simplicity (no cap/tod bucket matching complexity in recap context)
- dailyLossLimitHit approximated from realizedPnl < -$200 (no explicit flag exists in BotDailyStats schema)
- Trades without a StrategyRule (no recommendedHoldSec) counted as on-target to avoid unfairly penalizing score when new catalyst types appear
- getTodayDateET imported into bot.ts router to avoid duplicating ET date logic inline

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- GET /api/bot/recap and GET /api/bot/recap/history are ready for frontend consumption in Plan 07-03 (recap tab) and 07-04 (full recap page)
- recap_ready WebSocket event is live and will fire at 4:01 PM ET on every trading day
- All DailyRecapData TypeScript interfaces are exported from eodRecap.ts for frontend type sharing
- No blockers

---
*Phase: 07-end-of-day-recap-evaluation-framework*
*Completed: 2026-03-01*
