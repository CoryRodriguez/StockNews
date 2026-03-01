---
phase: 05-frontend-bot-dashboard
plan: "05-01"
subsystem: api
tags: [express, websocket, prisma, bot, rest-api, broadcast]

# Dependency graph
requires:
  - phase: 04-risk-management-enforcement
    provides: BotConfig with trailing stop fields, signal engine risk gates, position monitor exports
  - phase: 01-bot-infrastructure-foundation
    provides: BotTrade, BotConfig, BotDailyStats DB models; bot routes; botController singleton
  - phase: 03-trade-executor
    provides: positionMonitor.ts closePosition(); tradeExecutor; tradingWs
provides:
  - GET /api/bot/config — returns BotConfig singleton
  - PATCH /api/bot/config — partial update with validation (positionSizeUsd > 0, minWinRate 0-1)
  - GET /api/bot/positions — open BotTrade rows ordered by entryAt desc
  - GET /api/bot/trades — last 100 closed BotTrade rows ordered by exitAt desc
  - GET /api/bot/signals — last 100 rejected BotSignalLog rows with selected fields
  - GET /api/bot/status now includes dayTradeCount field
  - bot_status_update broadcast on every setBotState() call
  - bot_trade_closed broadcast on every closePosition() call
  - bot_signal_evaluated broadcast for all 11 rejection paths in evaluateBotSignal()
affects:
  - 05-02 (bot data layer — Zustand store consuming these endpoints)
  - 05-03 (BotPanel UI — fetches from these endpoints on mount)
  - 05-04 (BotConfigPanel — uses PATCH /config)
  - 05-05 (verification — checks these endpoints)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "broadcast('bot', ...) from clientHub.ts delivers all bot WS events"
    - "writeSignalLog returns created record for downstream broadcast use"
    - "broadcastRejectedSignal helper centralizes bot_signal_evaluated emission"
    - "Lightweight setBotState broadcast — full status hydrated on mount via GET /status"

key-files:
  created: []
  modified:
    - backend/src/routes/bot.ts
    - backend/src/services/botController.ts
    - backend/src/services/positionMonitor.ts
    - backend/src/services/signalEngine.ts

key-decisions:
  - "writeSignalLog() now returns created record instead of void — enables id-based broadcasts without a separate DB read"
  - "broadcastRejectedSignal() helper centralizes bot_signal_evaluated logic — avoids duplicate broadcast code at 11 rejection sites"
  - "setBotState broadcast sends lightweight snapshot (openPositionCount=0, pnl=0) — full status requires async DB queries incompatible with sync setBotState post-update"
  - "broadcast import in positionMonitor.ts uses exitAt local var to ensure broadcast and DB update share exact same timestamp"

patterns-established:
  - "Bot WS push pattern: DB write first, then broadcast — never broadcast speculative state"
  - "All bot WS events use channel 'bot' with a type discriminator field"

requirements-completed: [UI-01, UI-02, UI-03, UI-05, UI-06, UI-07]

# Metrics
duration: 4min
completed: 2026-02-28
---

# Phase 5 Plan 01: Backend Bot API Extension Summary

**Five new REST endpoints (/config GET+PATCH, /positions, /trades, /signals) and three WebSocket broadcast hookpoints (setBotState, closePosition, evaluateBotSignal rejections) wiring the backend to the Phase 5 frontend BotPanel**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-28T00:11:30Z
- **Completed:** 2026-02-28T00:15:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extended `bot.ts` with 5 new authenticated REST routes covering config read/write, open positions, trade history, and rejected signal log
- Added `dayTradeCount` field to existing GET /status response (was missing from Phase 1 implementation)
- Wired `broadcast('bot', ...)` into all three bot service files using the existing clientHub infrastructure
- Modified `writeSignalLog()` to return the created record, enabling id-based WebSocket broadcasts at all 11 rejection paths in the signal engine

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend bot.ts with four new REST endpoints and dayTradeCount in /status** - `34c0bcc` (feat)
2. **Task 2: Wire three WebSocket broadcasts into backend services** - `2446e52` (feat)

**Plan metadata:** (created in final commit below)

## Files Created/Modified
- `backend/src/routes/bot.ts` - Added updateConfig import; added dayTradeCount to /status; added GET/PATCH /config, GET /positions, GET /trades, GET /signals routes
- `backend/src/services/botController.ts` - Added broadcast import; setBotState() now emits bot_status_update after DB write
- `backend/src/services/positionMonitor.ts` - Added broadcast import; closePosition() now emits bot_trade_closed after DB update; extracted exitAt as local var for timestamp consistency
- `backend/src/services/signalEngine.ts` - Added broadcast import; writeSignalLog() returns created record; added broadcastRejectedSignal() helper; all 11 rejection paths call broadcastRejectedSignal()

## Decisions Made
- `writeSignalLog()` changed from `Promise<void>` to return the created record — this avoids a second DB query to get the record id for the broadcast, while keeping error handling via `null` return on failure
- `broadcastRejectedSignal()` is a no-op on null input — guards against DB write failures without requiring try/catch at every call site
- `setBotState` broadcast sends zeroed P&L and position counts — the function is async-after-prisma-update but synchronous for in-memory state; the frontend hydrates real values from GET /status on mount
- exitAt extracted as `const exitAt = new Date()` in `closePosition()` so DB and broadcast share the identical timestamp

## Deviations from Plan

None — plan executed exactly as written. The only extension beyond the literal plan text was broadcasting for ALL 11 rejection paths (not just the representative examples in the plan description), which matches the plan's intent of "add broadcast AFTER the write for rejected outcomes."

## Issues Encountered
None — TypeScript passed cleanly on first check for both tasks.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All REST endpoints are live and authenticated — frontend can fetch on mount
- All three WebSocket push types are wired — frontend subscribing to "bot" channel will receive real-time updates
- Plan 05-02 (bot data layer / Zustand store) and 05-03 (BotPanel UI) can proceed immediately

---
*Phase: 05-frontend-bot-dashboard*
*Completed: 2026-02-28*
