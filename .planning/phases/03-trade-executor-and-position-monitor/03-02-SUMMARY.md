---
phase: 03-trade-executor-and-position-monitor
plan: "02"
subsystem: trade-executor
tags: [trade-executor, trading-websocket, alpaca, bot-trade, notional-orders, fill-events]

# Dependency graph
requires:
  - phase: 03-trade-executor-and-position-monitor
    plan: "01"
    provides: BotConfig tradeSizeStars3/4/5 and profitTargetPct fields
  - phase: 01-bot-infrastructure-foundation
    provides: BotTrade model, botController (getAlpacaBaseUrl, getBotConfig)
provides:
  - tradeExecutor.ts — async notional buy order placement + BotTrade lifecycle
  - tradingWs.ts — Alpaca trading WebSocket, fill/partial_fill/rejected dispatch
affects: [03-03-position-monitor, 03-04-init-wiring, signal-engine-fire-and-forget]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Notional dollar-amount buy orders (not qty-based) via Alpaca REST POST /v2/orders"
    - "Star-rating sizing: tier+aiConfidence maps to 3|4|5 stars → tradeSizeStars3/4/5 config fields"
    - "Silent skip guard: duplicate open position check returns early with no DB write"
    - "Fire-and-forget execution: executeTradeAsync called via void + .catch in caller (signalEngine)"
    - "Partial fill reconciliation: GET /v2/positions/{symbol} for authoritative share count (never trust WS alone)"
    - "Trading WebSocket mode-aware URL: replace https with wss from getAlpacaBaseUrl() + /stream suffix"
    - "Reconnect pattern: 5s setTimeout on close, mirrors alpaca.ts"

key-files:
  created:
    - backend/src/services/tradeExecutor.ts
    - backend/src/services/tradingWs.ts
  modified: []

key-decisions:
  - "getNotional() always reads from getBotConfig() — no hardcoded dollar amounts"
  - "BotTrade created immediately on order placement (not on fill) — entryPrice/shares filled in by onFillEvent()"
  - "partial_fill calls GET /v2/positions/{symbol} for authoritative qty (EXEC-03 pitfall avoidance)"
  - "tradingWs.ts message handler is async void with .catch — prevents unhandled promise rejection on fill dispatch"
  - "restartTradingWs() uses 100ms setTimeout after close() to ensure socket state is reset before reconnect"
  - "onRejectedEvent does not receive a reason string from the Alpaca trading WS event — documented in code"

requirements-completed: [EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-06, EXEC-07]
# Note: EXEC-05 (notional not qty) was partially covered in 03-01 schema; fully implemented here
# EXEC-07 star-rating sizing implemented in getStarRating() + getNotional()

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 3 Plan 02: Trade Executor + Trading WebSocket Summary

**Notional buy order pipeline with star-rating sizing, BotTrade lifecycle, and Alpaca trading WebSocket for fill confirmation — completing the buy-side execution infrastructure (EXEC-01 through EXEC-07)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-28T19:36:05Z
- **Completed:** 2026-02-28T19:38:00Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- Created `tradeExecutor.ts` with full buy-side pipeline: star-rating sizing, duplicate position guard, notional buy order via Alpaca REST, BotTrade create/update lifecycle
- Created `tradingWs.ts` with mode-aware WebSocket URL, auth + subscribe flow, fill/partial_fill/rejected event dispatch to tradeExecutor callbacks
- All TypeScript compiles clean (tsc --noEmit: zero errors)
- All 4 plan verification checks pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tradeExecutor.ts — async notional buy + BotTrade lifecycle** - `0df1919` (feat)
2. **Task 2: Create tradingWs.ts — Alpaca trading WebSocket with reconnect** - `f370f91` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `backend/src/services/tradeExecutor.ts` — Created: star-rating sizing, dedup guard, notional buy order, BotTrade creation, onFillEvent (fill+partial_fill), onRejectedEvent
- `backend/src/services/tradingWs.ts` — Created: mode-aware WS URL, auth/subscribe flow, fill/partial_fill/rejected dispatch, 5s reconnect

## Decisions Made

- `getNotional()` always reads from `getBotConfig()` — no hardcoded dollar amounts anywhere in the file (plan requirement strictly followed)
- `BotTrade` record is created immediately after order placement (before fill confirmation) so the position is tracked even if the trading WebSocket loses connection
- `partial_fill` events call `GET /v2/positions/{symbol}` for authoritative share count, with fallback to WS qty if the REST call fails
- `tradingWs.ts` message handler is `async void handleTradingWsMessage(...).catch(...)` to prevent unhandled promise rejections on fill dispatch errors
- `restartTradingWs()` uses a 100ms `setTimeout` after `ws.close()` before reconnecting, giving the socket state machine time to fully reset
- Alpaca trading WebSocket `rejected` events do not include a reason string in the standard event schema; `onRejectedEvent` signature accepts optional `reason` but tradingWs.ts does not pass one

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

All 4 checks from the plan's `<verification>` block pass:

1. `tsc --noEmit` — zero errors
2. `grep executeTradeAsync|onFillEvent|onRejectedEvent tradeExecutor.ts` — all three present
3. `grep startTradingWs|restartTradingWs|trade_updates tradingWs.ts` — all three present
4. `grep "await executeTradeAsync" tradeExecutor.ts` — empty (no self-await; fire-and-forget is caller's job)

## Next Phase Readiness

- `tradeExecutor.ts` is ready for Plan 03-03 (`positionMonitor.ts`) to call `prisma.botTrade.findMany({ where: { status: 'open' } })` for the exit monitoring loop
- `tradingWs.ts` is ready for Plan 03-04 to call `startTradingWs()` in the server startup sequence
- Signal engine (`signalEngine.ts`) can now call `void executeTradeAsync(signal).catch(...)` to replace the current "log-only" placeholder
- No circular imports: tradingWs.ts imports from tradeExecutor.ts, tradeExecutor.ts does not import from tradingWs.ts or positionMonitor.ts

## Self-Check: PASSED

- FOUND: backend/src/services/tradeExecutor.ts
- FOUND: backend/src/services/tradingWs.ts
- FOUND commit 0df1919: feat(03-02): create tradeExecutor.ts
- FOUND commit f370f91: feat(03-02): create tradingWs.ts

---
*Phase: 03-trade-executor-and-position-monitor*
*Completed: 2026-02-28*
