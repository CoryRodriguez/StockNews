# Technology Stack: Autonomous Trading Bot

**Project:** StockNews — Day Trade Dashboard
**Milestone:** Autonomous trading bot on existing Node.js + Alpaca platform
**Researched:** 2026-02-27
**Scope:** Additive only — extends existing Node.js/Express/TypeScript/Prisma stack

---

## Context: What Already Exists

The existing system already uses Alpaca Markets with native `fetch` + `ws` for HTTP and WebSocket calls.
The paperTrader.ts already calls `https://paper-api.alpaca.markets/v2/orders` directly.
**No Alpaca SDK is needed or recommended** — the existing raw-fetch pattern works, is already proven,
and adds zero new dependencies.

The trading bot is an extension of paperTrader.ts with:
1. A live trading mode (different base URL, same API shape)
2. A persistent server-side bot loop (survives browser disconnections)
3. Risk management layer (daily loss limits, position sizing, PDT guard)
4. Position exit manager with profit target + stop loss + trailing stop + time limit

---

## Recommended Stack

### Core: No New Framework Dependencies

| Layer | Recommendation | Rationale |
|-------|---------------|-----------|
| HTTP client | Native `fetch` (already used) | Zero deps, proven in codebase, identical to existing Alpaca calls |
| WebSocket client | `ws` v8 (already used) | Already handles data stream + RTPR stream; trading stream uses same pattern |
| State management | Plain TypeScript Map + enum | XState is overkill for a bot with 4-5 states; existing pattern (ActivePosition Map in paperTrader) is sufficient |
| Scheduling | `node-cron` (new, lightweight) | Market hours guard, daily reset at 4 AM ET; avoids manual interval juggling |
| Persistence | Prisma + PostgreSQL (already used) | Bot state, positions, and daily P&L persisted to existing DB |
| Process management | Docker Compose (already used) | Already handles restart-on-crash; no additional process manager needed |

### Alpaca Trading API Integration

| Endpoint Set | Purpose | Base URL |
|-------------|---------|----------|
| Paper trading REST | Order placement/cancellation while validating bot logic | `https://paper-api.alpaca.markets` |
| Live trading REST | Real order execution when bot is validated | `https://api.alpaca.markets` |
| Trading WebSocket stream | Real-time order fill notifications | `wss://paper-api.alpaca.markets/stream` (paper) / `wss://api.alpaca.markets/stream` (live) |
| Data REST (existing) | Price snapshots for position monitoring | `https://data.alpaca.markets` (already integrated) |
| Data WebSocket (existing) | Real-time quotes for exit monitoring | `wss://stream.data.alpaca.markets/v2/iex` (already integrated) |

**Confidence:** HIGH — verified from Alpaca official documentation (docs.alpaca.markets/docs/websocket-streaming, docs.alpaca.markets/docs/paper-trading)

### New Dependencies (Minimal)

| Package | Version | Purpose | Why This |
|---------|---------|---------|----------|
| `node-cron` | `^3.0.3` | Market hours scheduling, daily circuit breaker reset | Lightweight (no deps), declarative cron syntax, well-maintained |

**That's it.** Everything else already exists in the codebase.

### Packages to NOT Add

| Package | Why Not |
|---------|---------|
| `@alpacahq/alpaca-trade-api` | npm package is stale (last major update 2022); the existing raw-fetch pattern is already working and simpler |
| `xstate` | 37 KB gzipped state machine library; overkill for a bot with states: IDLE → BUYING → HOLDING → SELLING → DONE. A TypeScript enum + Map handles this with zero overhead |
| `bull` / `bullmq` | Job queue for Redis; massively overengineered for a single-user personal bot; setTimeout/setInterval + Prisma persistence is sufficient |
| `ccxt` | Multi-exchange library; this project is Alpaca-only by design constraint |
| `technicalindicators` | TA library; the bot's exit decisions are time + price based (trailing stop, profit target), not indicator based |

---

## Alpaca Live vs Paper Trading: Key Differences

**Confidence:** HIGH — sourced from docs.alpaca.markets/docs/paper-trading

### URL is the Only Code Change

The entire API surface is identical between paper and live. The only architectural difference is the base URL:

```typescript
// config.ts — the proposed approach
alpacaTradingUrl: process.env.ALPACA_LIVE_TRADING === "true"
  ? "https://api.alpaca.markets"       // live
  : "https://paper-api.alpaca.markets" // paper (default, safe)
```

The same API key and secret work for both environments (Alpaca issues separate paper/live credentials, but the header format is identical).

### Paper Trading Behavior Differences (Gotchas)

| Behavior | Paper | Live |
|----------|-------|------|
| Fill simulation | Simulated from real-time IEX quotes | Actual exchange execution |
| Slippage | Not simulated — paper fills are "too clean" | Real slippage on market orders |
| Market impact | Not simulated | Real impact on thinly traded stocks |
| Price improvement | Not received | Possible on live |
| Fill speed | Instant (simulated) | Milliseconds to seconds |
| PDT rules | Enforced (same as live) | Enforced |
| Starting balance | $100k default (resettable) | Actual account balance |
| Regulatory fees | Not charged | Charged on live |
| Order fill emails | Not sent | Not applicable (API-only integration) |

**Critical implication for bot development:** Paper trading will overstate performance because slippage is not simulated. Catalyst-driven plays in thinly traded stocks will show better paper fills than live fills. Budget for 0.5-2% slippage reality check when transitioning to live.

### Trading WebSocket Stream (New Integration Needed)

The existing Alpaca WebSocket in `alpaca.ts` connects to the **data** stream (`stream.data.alpaca.markets`) for market quotes. The trading bot needs a **separate** connection to the **trading** stream for order fill notifications:

```typescript
// Paper: wss://paper-api.alpaca.markets/stream
// Live:  wss://api.alpaca.markets/stream

// Authentication (same pattern as data stream):
ws.send(JSON.stringify({
  action: "auth",
  key: ALPACA_API_KEY,
  secret: ALPACA_API_SECRET,
}));

// Subscribe to trade updates:
ws.send(JSON.stringify({
  action: "listen",
  data: { streams: ["trade_updates"] }
}));

// Fill event structure:
// {
//   stream: "trade_updates",
//   data: {
//     event: "fill",       // or partial_fill, canceled, expired
//     price: "105.89",     // execution price
//     qty: "10",           // filled quantity
//     position_qty: "10",  // total position after fill
//     timestamp: "2026-02-27T14:30:00Z",
//     order: { id, symbol, side, qty, status, ... }
//   }
// }
```

**Why this matters:** The existing `waitForFill()` in paperTrader.ts polls REST every 2 seconds to check fill status. With the trading WebSocket, fills arrive in real-time (sub-100ms), eliminating the polling loop and making the bot faster and cheaper on API calls.

**Confidence:** HIGH — verified from docs.alpaca.markets/docs/websocket-streaming

---

## Order Management Patterns

### Order Types to Use

| Scenario | Order Type | Alpaca Parameters |
|----------|-----------|-------------------|
| Bot entry | Market order | `type: "market"`, `time_in_force: "day"` |
| Profit target exit | Limit order | `type: "limit"`, `limit_price: target`, `time_in_force: "day"` |
| Stop loss exit | Stop order | `type: "stop"`, `stop_price: stop`, `time_in_force: "day"` |
| Trailing stop exit | Trailing stop | `type: "trailing_stop"`, `trail_percent: N`, `time_in_force: "day"` |
| Combined exit | Bracket order | `order_class: "bracket"`, `take_profit.limit_price`, `stop_loss.stop_price` |

**Recommendation:** Use Alpaca native bracket orders for the combined profit-target + stop-loss exit instead of managing two separate orders. This eliminates race conditions where both exit orders could partially fill.

```typescript
// Bracket order: buy with automatic exits attached
{
  symbol: "AAPL",
  qty: "10",
  side: "buy",
  type: "market",
  time_in_force: "day",
  order_class: "bracket",
  take_profit: { limit_price: "155.00" },   // profit target
  stop_loss:   { stop_price: "145.00" }      // stop loss
}
```

**Gotchas on order types (MEDIUM confidence — from docs.alpaca.markets/docs/orders-at-alpaca):**
- Trailing stops do NOT trigger outside regular hours (4AM-8PM ET). For pre-market entries, use bracket orders instead.
- Extended hours trading requires `time_in_force: "day"` and limit orders only — market orders are rejected pre/post-market.
- Stop orders convert to market orders when triggered — slippage risk on volatile catalysts.
- Limit prices must be within sub-penny rules: max 2 decimals for stocks >= $1.00; max 4 decimals for stocks < $1.00.

### Position Tracking

Use Alpaca's `/v2/positions` endpoint to reconcile bot state vs actual positions. This is critical for crash recovery — if the Docker container restarts mid-trade, the bot must re-read live positions on startup rather than assuming in-memory state is correct.

```typescript
// On bot startup: reconcile in-memory state with actual positions
GET /v2/positions          // all open positions
GET /v2/positions/{symbol} // specific symbol
DELETE /v2/positions/{symbol}?percentage=100  // close position
```

---

## Risk Management: What to Build (No External Library)

No Node.js risk management library is recommended. The risk controls needed are domain-specific and straightforward to implement in TypeScript. External libraries (like `jesse`, `freqtrade`) are Python-based and would require a sidecar process.

### Required Risk Controls

| Control | Implementation | Where |
|---------|---------------|-------|
| Max daily loss | Sum realized P&L from DB since midnight ET; halt if loss > threshold | `riskManager.ts` — check before every trade |
| Max concurrent positions | Count open positions from `activePositions` Map; reject new trades if at limit | `riskManager.ts` — check before every trade |
| Per-trade position sizing | Fixed dollar amount (e.g., $500 max per trade) → compute qty as `floor(amount / price)` | `riskManager.ts` — called by bot signal engine |
| PDT guard | Read `daytrade_count` from Alpaca account endpoint; block new day trades if count >= 3 and equity < $25k | `riskManager.ts` — check on live trading only |
| Market hours check | Reject entries outside 4AM-4PM ET (or configurable window) | `riskManager.ts` or `node-cron` guard |
| Cooldown per ticker | Already in paperTrader.ts — keep this pattern | Extend existing `recentTrades` Map |
| Circuit breaker | Halt all trading if N consecutive losses occur within a window | `riskManager.ts` — track loss streak |

**PDT Specifics (MEDIUM confidence — from Alpaca docs account endpoint):**

The Alpaca account endpoint at `GET /v2/account` returns:
- `pattern_day_trader: boolean` — true if account is already flagged PDT
- `daytrade_count: number` — round-trip trades (buy+sell same day) in last 5 trading days
- `daytrading_buying_power: string` — available buying power for intraday trades

A day trade is counted when a position opened and closed on the same trading day. If `daytrade_count >= 3` and account equity is under $25,000, the next day trade will flag the account as PDT and restrict trading for 90 days. The bot MUST check this before every live trade entry.

---

## Bot Persistence Architecture (Server-Side, Survives Browser Disconnect)

The existing `activePositions` Map in paperTrader.ts is in-memory only — it survives Express restarts but not container restarts. For a production autonomous bot, positions must be persisted to the database.

### Recommended Pattern

```typescript
// On bot startup (index.ts):
1. Read all open positions from Alpaca: GET /v2/positions
2. Cross-reference with BotTrade records in DB where status = "holding"
3. Re-attach exit monitors for any positions that survived restart
4. Connect trading WebSocket stream for real-time fill notifications

// Bot state machine (BotTradeStatus enum):
type BotTradeStatus =
  | "pending"    // signal fired, order not yet placed
  | "buying"     // buy order placed, awaiting fill
  | "holding"    // position open, monitoring exits
  | "selling"    // sell order placed, awaiting fill
  | "completed"  // trade closed
  | "failed"     // error state

// DB-persisted state transitions:
pending → buying (buy order placed)
buying  → holding (fill confirmed via WebSocket or REST)
holding → selling (exit condition triggered)
selling → completed (sell fill confirmed)
```

### Why In-Memory Map + DB is Sufficient (No Queue, No XState)

The existing architecture already handles this correctly. `paperTrader.ts` uses:
- Map for in-memory position tracking (O(1) lookups)
- Prisma for persistence (status flags in DB)
- setTimeout/setInterval for exit timing

The only missing piece for a production bot is **crash recovery** (re-reading positions from Alpaca on startup) and **DB persistence of bot state** (so we know which positions we own after a restart). Both are ~30 lines of code each. A state machine library adds no value here.

### Browser Disconnect Safety

Because the bot runs entirely server-side (Express process), browser disconnections have zero impact. The WebSocket connections to Alpaca and RTPR run in the server process. The bot can run for weeks without a browser connection. The frontend's `/ws` connection is display-only — it receives bot status updates via `broadcast()` calls, but the bot does not depend on it.

---

## Scheduling and Market Hours

```typescript
// node-cron: market hours guard
import cron from "node-cron";

// Reset daily loss circuit breaker at 4:00 AM ET (9:00 UTC)
cron.schedule("0 9 * * 1-5", () => {
  riskManager.resetDailyStats();
  console.log("[Bot] Daily stats reset for new trading day");
}, { timezone: "UTC" });

// Stop all monitoring at 4:00 PM ET (21:00 UTC) — hard close
cron.schedule("0 21 * * 1-5", () => {
  bot.closeAllPositions("market_close");
  console.log("[Bot] Market close — closing all positions");
}, { timezone: "UTC" });
```

**Why node-cron over cron-parser or node-schedule:** node-cron handles timezone, is actively maintained (v3.0.3, 2024), has no external dependencies, and is the standard for Express apps.

---

## Installation

```bash
# Only one new dependency needed:
cd backend
npm install node-cron
npm install -D @types/node-cron
```

The entire bot is built with existing dependencies:
- `ws` — already installed (trading WebSocket stream)
- `prisma/@prisma/client` — already installed (bot state persistence)
- `express` — already installed (REST API for bot control panel)
- Native `fetch` — already used for Alpaca REST calls

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Alpaca SDK | Raw fetch (existing) | `@alpacahq/alpaca-trade-api` | Last major release 2022; existing code already works; adds a dep for no gain |
| State machine | TypeScript enum + Map | XState v5 | 37KB library for 5 states; existing Map pattern is proven in codebase |
| Job scheduling | `node-cron` | `bull`/`bullmq` | Bull requires Redis; massive overkill for a personal single-user bot |
| Risk library | Custom TypeScript | `jesse` (Python) | Python sidecar introduces cross-language complexity; risk logic is simple enough to write in TypeScript |
| Position exits | Alpaca bracket orders | Manual dual-order management | Bracket orders are atomic — no race condition if both price targets hit simultaneously |
| Process persistence | Docker restart policy | PM2 | Docker Compose already handles restart; PM2 adds nothing |

---

## Sources

- Alpaca paper vs live URL differences: docs.alpaca.markets/docs/paper-trading (HIGH confidence, official docs, verified 2026-02-27)
- Alpaca order types and gotchas: docs.alpaca.markets/docs/orders-at-alpaca (HIGH confidence, official docs, verified 2026-02-27)
- Alpaca trading WebSocket stream: docs.alpaca.markets/docs/websocket-streaming (HIGH confidence, official docs, verified 2026-02-27)
- Alpaca account fields (PDT, daytrade_count): docs.alpaca.markets/docs/accounts (HIGH confidence, official docs, verified 2026-02-27)
- Existing codebase analysis: paperTrader.ts, alpaca.ts, strategyEngine.ts, config.ts, schema.prisma (HIGH confidence, direct code inspection)
- node-cron v3: Training data (MEDIUM confidence — current version; verify on npm before install)
