---
phase: 03-trade-executor-and-position-monitor
verified: 2026-02-28T00:00:00Z
status: passed
score: 12/12 must-haves verified
gaps: []
human_verification:
  - test: "Start the backend, enable the bot via POST /api/bot/start, and confirm [TradingWs] Authenticated — subscribed to trade_updates appears in logs"
    expected: "Alpaca paper trading WebSocket connects, authenticates, and subscribes to trade_updates within 5 seconds of startup"
    why_human: "WebSocket authentication requires live Alpaca credentials and network connectivity — cannot verify programmatically"
  - test: "Trigger a qualifying tier 1-2 signal (or temporarily lower thresholds) and confirm a [TradeExecutor] Order placed log line appears, followed by [TradeExecutor] Fill confirmed after the WebSocket fill event arrives"
    expected: "Bot places a notional buy order, receives fill confirmation via tradingWs, and updates BotTrade.entryPrice and BotTrade.shares from the fill event"
    why_human: "End-to-end fill flow requires a live Alpaca paper account and a real or simulated order — cannot verify without running the system"
  - test: "Let a paper trade sit until hard stop (-7%), profit target (+10%), or 5-minute hold limit triggers"
    expected: "positionMonitor.ts places a market sell order, updates BotTrade to status=closed with correct exitReason, exitPrice, and pnl"
    why_human: "Requires a live position, live price feed, and waiting for an exit condition — cannot verify statically"
  - test: "Wait until 3:45 PM ET on a weekday with open positions and confirm force-close fires"
    expected: "[PositionMonitor] EOD force-close at 3:45 PM ET appears in logs and all open positions are closed"
    why_human: "Requires waiting until 3:45 PM ET on a trading day — time-dependent behavior"
---

# Phase 3: Trade Executor and Position Monitor — Verification Report

**Phase Goal:** Trade Executor and Position Monitor — paper-mode bot places real notional buy orders, confirms fills via Alpaca trading WebSocket, and monitors open positions with hard stop/profit target/time exit loop + 3:45 PM ET EOD force-close.

**Verified:** 2026-02-28
**Status:** PASSED (automated checks) — human verification recommended for end-to-end flow
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bot places real notional buy orders on Alpaca paper API | VERIFIED | `tradeExecutor.ts:135` — `fetch(...${getAlpacaBaseUrl()}/v2/orders...)` with `notional` field in body; `AlpacaOrderRequest` type has `notional: number`, no `qty` field for buys |
| 2 | Fill confirmation via Alpaca trading WebSocket | VERIFIED | `tradingWs.ts:120-128` — `fill` and `partial_fill` events dispatched to `onFillEvent()`; `tradeExecutor.ts:163-217` — `onFillEvent()` updates `BotTrade.entryPrice` and `BotTrade.shares` |
| 3 | Partial fills reconcile with authoritative position query | VERIFIED | `tradeExecutor.ts:187-216` — `partial_fill` path calls `GET /v2/positions/{symbol}` and uses `position.qty` as authoritative share count |
| 4 | Rejection events handled without crash | VERIFIED | `tradeExecutor.ts:225-241` — `onRejectedEvent()` updates BotTrade to `status=missed`, `exitReason=alpaca_rejected`; logs reason; no throws |
| 5 | Position monitor checks hard stop / profit target / time exit every 5 seconds | VERIFIED | `positionMonitor.ts:131-145` — `setInterval(5000)` fetches batch snapshots via `getSnapshots()`, calls `checkExitConditions()` for each; all three exit conditions present at lines 52, 57, 62 |
| 6 | EOD force-close at 3:45 PM ET Mon-Fri | VERIFIED | `positionMonitor.ts:150` — `cron.schedule('45 15 * * 1-5', ...)` with `{ timezone: 'America/New_York' }` |
| 7 | Signal engine fires real trades (not log-only) | VERIFIED | `signalEngine.ts`: zero occurrences of `"log-only"` string; `void executeTradeAsync(...)` present at lines 481 and 566 (one per tier path) |
| 8 | Startup wires trading WS and position monitor | VERIFIED | `index.ts:120-121` — `startTradingWs()` and `startPositionMonitor()` called after `await initBot()` |
| 9 | Crash recovery — orphan positions imported and existing open positions hydrated | VERIFIED | `botController.ts:94-103` — `addPosition()` called for DB-open trades still live in Alpaca; `botController.ts:123-131` — orphan import with `prisma.botTrade.create()` + `addPosition()` |
| 10 | Mode switch reconnects trading WebSocket to correct endpoint | VERIFIED | `botController.ts:265` — `restartTradingWs()` called at end of `switchMode()`; `tradingWs.ts:82-85` — URL derived from `getAlpacaBaseUrl()` |
| 11 | BotConfig has star-rating sizing fields and profit target | VERIFIED | `schema.prisma:206-209` — `tradeSizeStars3`, `tradeSizeStars4`, `tradeSizeStars5`, `profitTargetPct` with correct defaults; `botController.ts:197-200` — all four in `initBot()` create block |
| 12 | Sold guard prevents double-exit race conditions | VERIFIED | `positionMonitor.ts:41` — `if (pos.sold) return` in `checkExitConditions()`; `positionMonitor.ts:73-74` — `if (pos.sold) return` + `pos.sold = true` at top of `closePosition()` before any async operation |

**Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/services/tradeExecutor.ts` | Notional buy + BotTrade lifecycle + fill/rejection handlers | VERIFIED | 297 lines; exports `executeTradeAsync`, `onFillEvent`, `onRejectedEvent`, `TradeSignal` |
| `backend/src/services/tradingWs.ts` | Alpaca trading WebSocket with reconnect | VERIFIED | 223 lines; exports `startTradingWs`, `restartTradingWs`; mode-aware URL; 5s reconnect |
| `backend/src/services/positionMonitor.ts` | 5s exit loop + EOD cron + position hydration | VERIFIED | 192 lines; exports `startPositionMonitor`, `addPosition`, `removePosition`; `setInterval` active at module load |
| `backend/src/services/signalEngine.ts` | Live executor calls replacing log-only | VERIFIED | `executeTradeAsync` imported and called via `void` pattern in both fired branches |
| `backend/src/services/botController.ts` | reconcilePositions + mode switch wiring | VERIFIED | `addPosition` at two call sites; `restartTradingWs()` in `switchMode()`; all four new BotConfig fields in create block |
| `backend/src/index.ts` | Startup sequence with tradingWs + positionMonitor | VERIFIED | Both imports and calls present after `await initBot()` |
| `backend/prisma/schema.prisma` | BotConfig with 4 new fields | VERIFIED | `tradeSizeStars3/4/5`, `profitTargetPct` at lines 206-209 with correct Float type and defaults |
| `backend/prisma/migrations/20260228000002_add_bot_config_sizing_fields/migration.sql` | 4 IF NOT EXISTS ALTER TABLE statements | VERIFIED | All 4 `ALTER TABLE "BotConfig" ADD COLUMN IF NOT EXISTS` statements present |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `signalEngine.ts` fired branches | `tradeExecutor.ts executeTradeAsync` | `void executeTradeAsync().catch()` | WIRED | Lines 481 and 566 in signalEngine.ts; imported at line 25 |
| `tradingWs.ts handleTradingWsMessage` | `tradeExecutor.ts onFillEvent` | `onFillEvent()` called on fill/partial_fill | WIRED | `tradingWs.ts:22` imports `onFillEvent`; called at line 121 |
| `tradingWs.ts handleTradingWsMessage` | `tradeExecutor.ts onRejectedEvent` | `onRejectedEvent()` called on rejected | WIRED | `tradingWs.ts:22` imports `onRejectedEvent`; called at line 131 |
| `positionMonitor.ts setInterval` | `alpaca.ts getSnapshots` | `getSnapshots([...openSymbols])` every 5s | WIRED | `positionMonitor.ts:135` — batch call to `getSnapshots(symbols)` |
| `positionMonitor.ts closePosition` | `prisma BotTrade` | `prisma.botTrade.update({ status: 'closed', ... })` | WIRED | `positionMonitor.ts:109-118` — full update with exitReason, exitPrice, exitAt, pnl |
| `positionMonitor.ts scheduleEodForceClose` | `node-cron` | `cron.schedule('45 15 * * 1-5', handler, { timezone: 'America/New_York' })` | WIRED | `positionMonitor.ts:150-159` |
| `botController.ts reconcilePositions` | `positionMonitor.ts addPosition` | `addPosition()` for each open DB trade + each orphan | WIRED | `botController.ts:94` and `botController.ts:123` — two call sites |
| `index.ts server.listen` | `tradingWs.ts startTradingWs` | Called after `await initBot()` | WIRED | `index.ts:120` |
| `index.ts server.listen` | `positionMonitor.ts startPositionMonitor` | Called after `await initBot()` | WIRED | `index.ts:121` |
| `botController.ts switchMode` | `tradingWs.ts restartTradingWs` | Called after mode update | WIRED | `botController.ts:265` |
| `tradeExecutor.ts getNotional` | `botController.ts BotConfig` | Reads `cfg.tradeSizeStars3/4/5` from `getBotConfig()` | WIRED | `tradeExecutor.ts:86-89` — all three star amounts read from config, no hardcoded values |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXEC-01 | 03-02, 03-04 | Bot places market buy orders on Alpaca paper API | SATISFIED | `tradeExecutor.ts:135` — POST to Alpaca `/v2/orders`; response stored in BotTrade |
| EXEC-02 | 03-02, 03-05 | Fill confirmation via Alpaca trading WebSocket | SATISFIED | `tradingWs.ts:120-128` — fill/partial_fill events routed to `onFillEvent()` |
| EXEC-03 | 03-02, 03-05 | Partial fills reconciled via position endpoint | SATISFIED | `tradeExecutor.ts:187-211` — `GET /v2/positions/{symbol}` call on partial_fill |
| EXEC-04 | 03-02, 03-05 | Rejection events handled without crash | SATISFIED | `tradeExecutor.ts:225-241` — `onRejectedEvent()` marks `status=missed`, no throws |
| EXEC-05 | 03-01, 03-02 | Dollar-notional sizing (not fixed shares) | SATISFIED | `tradeExecutor.ts:126-132` — order body has `notional` field only, no `qty` for buys |
| EXEC-06 | 03-02, 03-04 | Trade execution is fire-and-forget | SATISFIED | `signalEngine.ts:481,566` — `void executeTradeAsync().catch()` pattern |
| EXEC-07 | 03-01, 03-02 | Confidence-tiered position sizing | SATISFIED (design divergence noted) | `tradeExecutor.ts:73-90` — tier/AI confidence maps to star rating (3/4/5); notional read from BotConfig fields. Note: REQUIREMENTS.md specifies multipliers on a base amount; CONTEXT.md locked this to flat dollar amounts per star rating instead. Both achieve configurable confidence-tiered sizing — the BotConfig fields serve the same purpose. |
| EXIT-01 | 03-03, 03-05 | Hard stop loss at configurable % from entry | SATISFIED | `positionMonitor.ts:52-54` — `pctChange <= -cfg.hardStopLossPct` triggers `closePosition(..., 'hard_stop')` |
| EXIT-02 | — (deferred) | Trailing stop loss | DEFERRED | Officially deferred to Phase 4 per user decision (CONTEXT.md). `peakPrice` is tracked as groundwork only. No exit logic fires on it. |
| EXIT-03 | 03-03, 03-05 | Profit target exit | SATISFIED | `positionMonitor.ts:57-59` — `pctChange >= cfg.profitTargetPct` triggers `closePosition(..., 'profit_target')` |
| EXIT-04 | 03-03, 03-05 | Time-based forced exit | SATISFIED | `positionMonitor.ts:62-64` — `holdMinutes >= maxHoldMinutes` triggers `closePosition(..., 'time_exit')` |
| EXIT-05 | 03-03, 03-05 | EOD force-close at 3:45 PM ET | SATISFIED | `positionMonitor.ts:150-159` — `cron.schedule('45 15 * * 1-5', ...)` with America/New_York timezone |
| EXIT-06 | 03-03, 03-05 | 5-second position polling | SATISFIED | `positionMonitor.ts:131-145` — `setInterval(5000)` with batch `getSnapshots()` call |

**Deferred from Phase 3 scope:** EXIT-02 (trailing stop) — explicitly deferred to Phase 4 per user decision recorded in CONTEXT.md and noted in all relevant plan files. REQUIREMENTS.md traceability table marks EXIT-02 as Phase 3 / Pending.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `signalEngine.ts` | 12 | Stale comment: "Plan 02-03 will replace the 'ai-unavailable' placeholder" | Info | Dead comment — AI path is already fully implemented (lines 491-574). No functional impact. |
| `signalEngine.ts` | 458 | Stale comment: "Tier 3-4: AI classification required — placeholder until Plan 02-03" | Info | Dead comment — tier 3-4 AI evaluation is implemented in the same function. No functional impact. |

No blocker or warning-level anti-patterns found. The two info-level items are stale comments from earlier development phases; the code they describe is correctly implemented.

---

## Design Notes

### EXEC-07 Implementation vs. Requirement Text

REQUIREMENTS.md describes EXEC-07 as "apply a configurable multiplier to the base position size (default 2x for high confidence, 1x medium, 0.5x low)." CONTEXT.md locked the Phase 3 design to flat dollar amounts per star rating ($50/$75/$100 stored in `tradeSizeStars3/4/5`).

The implementation satisfies the intent — confidence-tiered, configurable position sizing — but uses a different mechanism: absolute dollar floors per tier rather than multipliers on a base. This is a deliberate design decision made during the pre-phase discussion. The BotConfig fields are fully configurable and the mapping is:

- Tier 1-2 (or AI high confidence) → 5-star → `tradeSizeStars5` ($100 default)
- AI medium confidence → 4-star → `tradeSizeStars4` ($75 default)
- AI low confidence → 3-star → `tradeSizeStars3` ($50 default)
- No/null AI confidence on tier 3-4 → skip (no trade)

The `positionSizeUsd`, `confidenceMultiplierHigh/Med/Low` fields remain in BotConfig from Phase 1 but are unused by the Phase 3 executor. This is expected — Phase 4+ risk management may reference them.

---

## Human Verification Required

### 1. Trading WebSocket Authentication

**Test:** Start the backend with valid Alpaca paper API credentials. Check logs within 10 seconds.

**Expected:** `[TradingWs] Connecting to wss://paper-api.alpaca.markets/stream` followed by `[TradingWs] Authenticated — subscribed to trade_updates`

**Why human:** Requires live Alpaca credentials and network access to paper API endpoint.

### 2. End-to-End Buy Order + Fill Confirmation

**Test:** Enable the bot via `POST /api/bot/start`. Introduce a qualifying article (or temporarily lower `minRelativeVolume` threshold and use a news source that delivers a tier 1-2 catalyst).

**Expected:** `[TradeExecutor] Order placed: {SYMBOL} notional=$100 stars=5 orderId=...` followed by `[TradeExecutor] Fill confirmed: {SYMBOL} orderId=... shares=... avgPrice=...` after the Alpaca fill event arrives.

**Why human:** Requires a live paper account, a real or synthetic news event, and WebSocket fill delivery.

### 3. Exit Condition Enforcement

**Test:** Open a paper position and let price move against it by 7% (hard stop), or hold for 5 minutes (time exit), or gain 10% (profit target).

**Expected:** `[PositionMonitor] SELL placed ({exit_reason}): {SYMBOL} qty=... order=...` followed by BotTrade record updated to `status=closed` with correct `exitReason`, `exitPrice`, and `pnl`.

**Why human:** Requires live price movement against an open position. Cannot be verified statically.

### 4. EOD Force-Close Cron

**Test:** Have at least one open position at 3:45 PM ET on a weekday.

**Expected:** `[PositionMonitor] EOD force-close at 3:45 PM ET` in logs, all open positions closed.

**Why human:** Time-dependent behavior requiring waiting until 3:45 PM ET on a trading day.

---

## Gaps Summary

No gaps found. All 12 automated truths verified. All artifacts exist, are substantive (not stubs), and are correctly wired. TypeScript compilation passes with zero errors (`npx tsc --noEmit` produced no output).

The only open item is EXIT-02 (trailing stop), which is **officially deferred to Phase 4** per user decision recorded in CONTEXT.md. This is not a gap — it is a planned deferral with groundwork (`peakPrice` tracking) already in place.

---

_Verified: 2026-02-28_
_Verifier: Claude (gsd-verifier)_
