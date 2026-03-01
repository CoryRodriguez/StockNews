---
phase: 06-live-trading-mode
plan: "06-01"
subsystem: api

tags: [alpaca, paper-trading, live-trading, gate, prisma, express]

# Dependency graph
requires:
  - phase: 01-bot-infrastructure-foundation
    provides: switchMode(), BotTrade schema, BotDailyStats schema, botController.ts
  - phase: 04-risk-management-enforcement
    provides: positionMonitor exports (open position guard depends on positionMonitor state)
provides:
  - goLiveGate.ts — evaluateGoLiveGate() + GoLiveGate interface
  - POST /api/bot/mode — gated mode switching (paper→live blocked until gate passes)
  - GET /api/bot/gate — current gate status JSON for BotPanel UI
affects:
  - 06-02-PLAN (BotPanel live mode UI depends on both routes)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server-side gate enforcement — gate evaluated at route layer, never trusting client assertions
    - Business day adjacency logic — Monday→Friday gap is 3 calendar days, Tue–Fri is 1

key-files:
  created:
    - backend/src/services/goLiveGate.ts
  modified:
    - backend/src/routes/bot.ts

key-decisions:
  - "goLiveGate uses take:10 on BotDailyStats to find 5 consecutive days — extra buffer handles non-consecutive rows"
  - "Gate check is server-side only in POST /mode — client gate display (GET /gate) is informational only"
  - "blockingReason reports first failing check (tradeCount → winRate → cleanDays priority)"
  - "live→paper switch skips gate re-check — downgrade is always safe, upgrade requires validation"
  - "T12:00:00Z suffix on date strings avoids DST boundary issues in business day adjacency calc"

patterns-established:
  - "Gate service pattern: pure async query function returning structured pass/fail with human-readable blockingReason"
  - "Route layer gate enforcement: evaluate gate before delegating to service, return 403 with gate payload on failure"

requirements-completed: [LIVE-01, LIVE-02, LIVE-03]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 6 Plan 01: Go-Live Gate Service and Mode Switch Routes Summary

**Server-side go-live gate enforcing 30-trade/40%-win-rate/5-clean-day criteria before paper→live switch, exposed via POST /api/bot/mode and GET /api/bot/gate**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-01T14:50:03Z
- **Completed:** 2026-03-01T14:51:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `goLiveGate.ts` with `GoLiveGate` interface and `evaluateGoLiveGate()` that queries BotTrade (closed count + win rate) and BotDailyStats (consecutive clean days)
- Implemented `countConsecutiveBusinessDays()` with correct Mon→Fri adjacency (3-day gap vs 1-day for Tue–Fri)
- Added `POST /api/bot/mode` with server-side gate enforcement for paper→live (403 if not passed) and unconditional allow for live→paper
- Added `GET /api/bot/gate` returning full GoLiveGate JSON for BotPanel progress display
- Zero TypeScript errors; no new npm dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1: Create goLiveGate.ts service with evaluateGoLiveGate()** - `569792d` (feat)
2. **Task 2: Add POST /mode and GET /gate routes to bot.ts** - `65b2634` (feat)

## Files Created/Modified
- `backend/src/services/goLiveGate.ts` - GoLiveGate interface + evaluateGoLiveGate() + countConsecutiveBusinessDays() helper
- `backend/src/routes/bot.ts` - Added switchMode import, evaluateGoLiveGate import, POST /mode route, GET /gate route

## Decisions Made
- Gate service uses `take: 10` when querying BotDailyStats to have extra rows beyond the 5 needed for the consecutive check
- `T12:00:00Z` suffix prevents DST boundary issues when converting YYYY-MM-DD strings to Date objects for diff calculation
- `blockingReason` reports the first failing check in priority order: tradeCount first, then winRate, then cleanDays
- Both routes protected by `requireAuth` — consistent with all other bot routes
- `switchMode()` open-position guard remains at service layer (botController.ts unchanged) — route gate is defense-in-depth on top

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- `POST /api/bot/mode` and `GET /api/bot/gate` routes are live and ready for Plan 06-02 BotPanel UI integration
- Gate thresholds (30 trades, 40% win rate, 5 clean days) are hardcoded constants — easily adjustable if needed
- switchMode() open-position guard remains intact at service layer (INFRA-08 preserved)

---
*Phase: 06-live-trading-mode*
*Completed: 2026-03-01*
