---
phase: 01-bot-infrastructure-foundation
plan: 03
subsystem: api
tags: [express, typescript, prisma, bot, lifecycle, rest]

# Dependency graph
requires:
  - phase: 01-02
    provides: botController.ts with getBotState, setBotState, getBotConfig, initBot, isMarketOpen
  - phase: 01-01
    provides: BotTrade, BotConfig, BotDailyStats Prisma models
provides:
  - REST API for bot lifecycle control (/start, /pause, /resume, /stop, /status)
  - initBot() called in server startup sequence after strategy cache is warm
  - Phase 1 complete — persistence layer + controller + REST API all wired together
affects: [Phase 2 Signal Engine, Phase 3 Trade Executor, Phase 5 Frontend Bot Dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Router module pattern following trades.ts (Router, requireAuth, export default)
    - State machine guards in route handlers (check current state before transition)
    - Async startup sequence: loadStrategies → recomputeStrategies → initBot → setInterval

key-files:
  created:
    - backend/src/routes/bot.ts
  modified:
    - backend/src/index.ts

key-decisions:
  - "initBot() placed after recomputeStrategies() so strategy win-rate data is available before bot accepts signals"
  - "Invalid state transitions return HTTP 400 with descriptive messages (not 409) — consistent with existing API error patterns"
  - "GET /status always succeeds (no state guard) — UI polls this regardless of bot state"

patterns-established:
  - "Route guards: check current state, return 400 with descriptive error, then execute transition"
  - "All bot endpoints require authentication via requireAuth middleware"
  - "Today's date for DB queries via Intl.DateTimeFormat en-CA + America/New_York timezone"

requirements-completed: [INFRA-05, INFRA-06]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 1 Plan 03: REST Routes + index.ts Wiring Summary

**Five-endpoint Express bot API (/start, /pause, /resume, /stop, /status) wired into index.ts with awaited initBot() completing Phase 1 infrastructure**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-27T03:24:20Z
- **Completed:** 2026-02-27T03:26:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `backend/src/routes/bot.ts` with all 5 lifecycle endpoints, each protected by `requireAuth`
- State transition guards enforce valid transitions (start from stopped, pause from running, resume from paused, stop from running|paused)
- Invalid transitions return HTTP 400 with descriptive error messages
- `GET /api/bot/status` queries DB live for open position count and today's realized P&L/trade count
- Wired `botRouter` into `index.ts` at `/api/bot` and added `await initBot()` in startup sequence after strategy cache is warm
- TypeScript compiles cleanly — zero new errors introduced

## Endpoint Signatures and State Transition Rules

| Endpoint | Valid From | Transition To | Guard (400 error) |
|----------|-----------|---------------|-------------------|
| `POST /start` | stopped | running | "Bot is already running" / "Bot is paused — use /resume to continue" |
| `POST /pause` | running | paused | "Bot must be running to pause" |
| `POST /resume` | paused | running | "Bot must be paused to resume" |
| `POST /stop` | running or paused | stopped | "Bot is already stopped" |
| `GET /status` | any | — | none (always returns snapshot) |

## GET /api/bot/status Response Shape

```typescript
{
  state: "stopped" | "running" | "paused",
  mode: "paper" | "live",
  openPositionCount: number,   // live count from prisma.botTrade.count({ status: 'open' })
  todayRealizedPnl: number,    // from prisma.botDailyStats.findFirst({ date: todayET })
  todayTradeCount: number,     // from prisma.botDailyStats.findFirst({ date: todayET })
  marketOpen: boolean,         // isMarketOpen() — 9:30 AM–4:00 PM ET, weekdays
}
```

## initBot() Startup Sequence (index.ts)

```
1. await loadArticlesFromDb()
2. startRtpr(), startBenzinga(), startAlpacaNews(), startAlpacaWs(), startScanner()
3. await loadStrategiesFromDb()
4. await recomputeStrategies()       ← strategy cache warm
5. await initBot()                   ← NEW: loads config, reconciles positions
6. setInterval(() => recomputeStrategies(), 60 * 60 * 1000)
```

## Task Commits

Each task was committed atomically:

1. **Task 1: Create routes/bot.ts with lifecycle endpoints** - `df03042` (feat)
2. **Task 2: Wire bot router and initBot() into index.ts** - `218dffc` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `backend/src/routes/bot.ts` - Express Router with /start, /pause, /resume, /stop, /status endpoints; all guarded by requireAuth
- `backend/src/index.ts` - Added botRouter import + mount at /api/bot; added initBot import + await in startup sequence

## Decisions Made
- `initBot()` placed after `recomputeStrategies()` in startup sequence — strategy win-rate data must be available before bot can evaluate signals in Phase 2
- Invalid state transitions return HTTP 400 (not 409 Conflict) — matches existing Express route error pattern in this codebase
- `GET /status` has no state guard — the UI always polls this endpoint regardless of bot state; it must always succeed

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 1 is complete. All three plans delivered:
- **01-01:** BotTrade, BotConfig, BotDailyStats schema models + migration SQL
- **01-02:** `botController.ts` singleton with state machine, reconciliation, mode guard, config accessors
- **01-03:** REST API routes + index.ts wiring

Phase 2 (Signal Engine) can now:
- Import `getBotState()` to check if bot is running before acting on signals
- Import `getBotConfig()` to read thresholds (minWinRate, enabledCatalystTiers, etc.)
- Use `GET /api/bot/status` for UI polling during development/testing

## Self-Check: PASSED

- FOUND: `backend/src/routes/bot.ts`
- FOUND: `backend/src/index.ts`
- FOUND commit `df03042` (feat(01-03): create REST route handler)
- FOUND commit `218dffc` (feat(01-03): wire bot router and initBot())

---
*Phase: 01-bot-infrastructure-foundation*
*Completed: 2026-02-27*
