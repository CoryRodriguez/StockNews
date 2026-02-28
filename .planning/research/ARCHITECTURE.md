# Architecture Patterns: Autonomous Trading Bot Integration

**Domain:** Autonomous trading bot embedded in existing Node.js/Express/WebSocket backend
**Researched:** 2026-02-27
**Overall confidence:** HIGH (existing codebase fully read; Alpaca API verified via official docs)

---

## Recommended Architecture

The bot integrates as a server-side module that lives inside the existing Express process. No separate process, no worker threads for v1 — the Node.js event loop is sufficient for the concurrency model needed (I/O-bound order operations, not CPU-bound). The bot shares the existing Alpaca REST client, the clientHub broadcast channel, and Prisma.

### High-Level Component Map

```
┌──────────────────────────────────────────────────────────────────┐
│  External Data Sources                                           │
│  RTPR.io WS ──┐                                                  │
│  Benzinga REST─┤──► newsIngestion (rtpr.ts / benzinga.ts)         │
│  AlpacaNews WS─┘        │                                        │
│                          │  RtprArticle events                   │
│  Alpaca Data WS ──────► quoteStream (alpaca.ts)                  │
│  Alpaca Scanner REST ──► scanner.ts (30s poll)                   │
└──────────────────────────────────────────────────────────────────┘
                    │ news events + scanner state
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Signal Engine  (NEW: botSignalEngine.ts)                        │
│  • catalystClassifier.ts (existing) — classify headline         │
│  • strategyEngine.ts (existing) — win rate lookup               │
│  • Risk gate: daily loss limit, max concurrent positions        │
│  • Emits: TradeSignal { ticker, category, tier, strategy }      │
└─────────────────────────────────────────────────────────────────┘
                    │ TradeSignal
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Trade Executor  (NEW: tradeExecutor.ts)                         │
│  • Mode switch: paper (paper-api.alpaca.markets) or live        │
│                 (api.alpaca.markets) — same code, different URL  │
│  • Places buy order → polls/streams for fill                    │
│  • On fill: persists BotTrade record, starts position monitor   │
│  • Broadcasts bot:trade_update to clientHub                     │
└─────────────────────────────────────────────────────────────────┘
                    │ filled position
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Position Monitor  (NEW: positionMonitor.ts)                     │
│  • Per-position state machine (OPEN → MONITORING → CLOSED)      │
│  • Polls price every 5s (reuses getSnapshots from alpaca.ts)    │
│  • OR: subscribes to Alpaca order update WebSocket for fills    │
│  • Applies exit rules: trailing stop, profit target, time limit │
│  • Persists state on each cycle (survives restart via DB load)  │
└─────────────────────────────────────────────────────────────────┘
                    │ exit signals
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Risk Manager  (NEW: riskManager.ts)                             │
│  • In-memory + DB-persisted daily P&L accumulator               │
│  • Max daily loss circuit breaker (halts new signals)           │
│  • Max concurrent position limiter                              │
│  • Position sizing calculator                                   │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Bot Controller  (NEW: botController.ts)                         │
│  • Lifecycle: start / pause / resume / stop                     │
│  • Bot state: RUNNING | PAUSED | STOPPED | MARKET_CLOSED        │
│  • REST endpoints: POST /api/bot/start, /pause, /stop           │
│  • REST endpoint: GET /api/bot/status                           │
│  • GET /api/bot/positions — open bot positions                  │
│  • Reads config: enabled tiers, risk params                     │
└─────────────────────────────────────────────────────────────────┘
                    │ broadcasts
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  clientHub.ts (existing)                                         │
│  Channel: "bot:status"   — bot state changes                    │
│  Channel: "bot:trade"    — new signals, fills, exits            │
│  Channel: "bot:position" — active position updates              │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend Bot Dashboard Panel (NEW)                              │
│  • Bot status indicator (running/paused/stopped)                │
│  • Active positions with P&L (live price from positionMonitor)  │
│  • Recent bot trades log                                        │
│  • Controls: pause/resume, emergency stop                       │
│  • Config panel: enabled tiers, max positions, loss limit       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

### What Talks to What

| Component | Inputs | Outputs | Communicates With |
|-----------|--------|---------|-------------------|
| `botSignalEngine.ts` | `RtprArticle` from news services, scanner alert state | `TradeSignal` | `catalystClassifier.ts`, `strategyEngine.ts`, `riskManager.ts`, `tradeExecutor.ts` |
| `tradeExecutor.ts` | `TradeSignal` | `FilledPosition` | Alpaca REST (buy order), `prisma` (BotTrade record), `clientHub` (broadcast), `positionMonitor.ts` |
| `positionMonitor.ts` | `FilledPosition`, price ticks | exit actions | `alpaca.ts` (price polls), `tradeExecutor.ts` (sell), `prisma` (state updates), `clientHub` (broadcast) |
| `riskManager.ts` | trade signals (pre-exec), exits (post-exec) | allow/deny decisions, sizing | `prisma` (daily P&L), in-memory counters |
| `botController.ts` | HTTP requests, process startup | bot state, REST responses | all bot modules, `clientHub`, `index.ts` |
| `clientHub.ts` (existing) | broadcast calls | WebSocket messages | frontend browser clients |

### Critical Separation

The **signal engine must not block on order execution**. `botSignalEngine.ts` emits a signal and returns immediately. `tradeExecutor.ts` handles the async order lifecycle independently. This prevents a slow Alpaca API response from backing up news processing.

The **position monitor must not share state with the signal engine**. Positions are self-contained records loaded from the DB on startup.

---

## Data Flow: News Event to Executed Trade

```
1. News article arrives (rtpr.ts or benzinga.ts)
   └─► pushArticle() → DB + memory ring buffer
   └─► broadcast("news", ...) → browser clients
   └─► getActiveScannersForTicker(ticker)
         │
         │ [ticker is on a scanner alert]
         ▼
2. botSignalEngine.evaluateNewsSignal(article, scannerIds)
   └─► catalystClassifier.classifyCatalystGranular(title, body)
         │ → CatalystClassification { category, tier }
         │ [tier not in bot's enabled tiers] → DROP
         ▼
   └─► strategyEngine.getStrategy(category, marketCap, now)
         │ → StrategyRecommendation { holdDurationSec, trailingStopPct, winRate }
         │ [winRate below threshold] → DROP
         ▼
   └─► riskManager.canTrade(ticker)
         │ [daily loss limit hit] → DROP, broadcast bot:paused
         │ [max positions open] → DROP
         │ [ticker in cooldown] → DROP
         ▼
   └─► emit TradeSignal → tradeExecutor.execute(signal)

3. tradeExecutor.execute(signal)
   └─► INSERT BotTrade { status: "PENDING_ENTRY" } → DB
   └─► broadcast("bot:trade", { status: "PENDING_ENTRY", ... })
   └─► POST /v2/orders (market buy) → Alpaca paper/live API
   └─► poll GET /v2/orders/:id until filled (or timeout)
         │ [order filled]
         ▼
   └─► UPDATE BotTrade { status: "OPEN", entryPrice, orderId }
   └─► broadcast("bot:trade", { status: "OPEN", entryPrice, ... })
   └─► positionMonitor.startMonitoring(position)
   └─► riskManager.registerPosition(ticker, qty, entryPrice)

4. positionMonitor.startMonitoring(position)
   └─► every 5s: getSnapshots([ticker]) → currentPrice
         │ → update peakPrice, check trailing stop
         │ → check profit target (if configured)
         │ → check hold time deadline
         │ [exit condition met]
         ▼
   └─► broadcast("bot:position", { ticker, currentPrice, returnPct, ... })
   └─► tradeExecutor.executeSell(position, reason)

5. tradeExecutor.executeSell(position, reason)
   └─► POST /v2/orders (market sell) → Alpaca API
   └─► poll until filled
   └─► UPDATE BotTrade { status: "CLOSED", exitPrice, pnl }
   └─► broadcast("bot:trade", { status: "CLOSED", pnl, reason, ... })
   └─► riskManager.recordExit(pnl)
   └─► strategyEngine.onTradeCompleted() (triggers recompute if threshold)
```

---

## Trade State Machine

A `BotTrade` record passes through these states:

```
PENDING_ENTRY
    │  buy order placed, waiting for fill
    │  (timeout → ERROR if no fill in 30s)
    ▼
OPEN
    │  buy filled, position monitor running
    │  (price monitored every 5s)
    ▼
PENDING_EXIT
    │  sell order placed, waiting for fill
    │  (timeout → ERROR if no fill in 30s)
    ▼
CLOSED
    │  sell filled, P&L computed, analytics recorded
    ▼
  [terminal]

ERROR
    │  buy or sell order failed (API error, market closed, etc.)
    ▼
  [terminal — requires manual inspection]
```

**State persistence rule:** Every state transition writes to `BotTrade.status` in the DB before the next async operation. This means if the process crashes during `OPEN`, the position monitor restarts from the DB record on the next process start.

**Crash recovery:** On startup, `botController.ts` queries for all `BotTrade` records with status `OPEN` or `PENDING_EXIT` and restarts their position monitors. `PENDING_ENTRY` records are marked `ERROR` (the order may or may not have executed — safer to flag for review).

---

## Alpaca Live Trading API

### Paper vs Live: The Only Difference Is the Base URL

```typescript
// Paper trading (existing config)
const BASE_URL = "https://paper-api.alpaca.markets";

// Live trading (same API key ID, different secret for live account)
const BASE_URL = "https://api.alpaca.markets";
```

The API request structure, headers, and order format are identical. The transition from paper to live is a config flag change, not a code change.

### Order Placement — Market Buy

```typescript
POST /v2/orders
{
  "symbol": "AAPL",
  "qty": "100",
  "side": "buy",
  "type": "market",
  "time_in_force": "day"
}
```

Response includes `id` (order UUID) and `status`. Poll `GET /v2/orders/:id` until `status === "filled"` and `filled_avg_price` is set.

### Bracket Order (Single API Call for Entry + Stop + Target)

```typescript
POST /v2/orders
{
  "symbol": "AAPL",
  "qty": "100",
  "side": "buy",
  "type": "market",
  "time_in_force": "day",
  "order_class": "bracket",
  "take_profit": {
    "limit_price": "15.50"   // profit target price
  },
  "stop_loss": {
    "stop_price": "12.00",   // stop trigger price
    "limit_price": "11.90"   // stop limit (optional; use stop_price only for stop-market)
  }
}
```

**Tradeoff vs. manual exit management:** Bracket orders let Alpaca manage the exit entirely — no position monitor polling needed. The downside is they don't support trailing stops (Alpaca restriction as of 2025: trailing stop not supported as bracket order component). The recommended approach for v1 is to use bracket orders with fixed stop/target AND layer a position monitor on top for trailing stop logic if the strategy engine recommends it.

### Order Update Streaming (Alternative to Polling)

```
WebSocket: wss://paper-api.alpaca.markets/stream  (paper)
           wss://api.alpaca.markets/stream         (live)

Auth message: { "action": "auth", "key": "...", "secret": "..." }
Subscribe:    { "action": "listen", "data": { "streams": ["trade_updates"] } }

Fill event: { "stream": "trade_updates", "data": { "event": "fill",
              "order": { "id": "...", "status": "filled",
                         "filled_avg_price": "14.23", ... },
              "price": "14.23", "qty": "100" } }
```

Use order update streaming in the position monitor instead of polling when the bot has many open positions (reduces REST call volume). For v1 with low concurrent positions, polling `GET /v2/orders/:id` every 2 seconds is acceptable and simpler.

---

## Bot Lifecycle and Persistence

### Where the Bot Runs

The bot is a set of modules initialized in `index.ts` alongside the existing services. No subprocess, no worker thread. Pattern:

```typescript
// index.ts (addition at bottom of server.listen callback)
const botController = await startBotController();
// botController loads open positions from DB and resumes monitoring
```

This means the bot persists as long as the Node process is alive (Docker container). Docker Compose's `restart: unless-stopped` ensures it comes back after crashes.

### Graceful Restart

On shutdown signal (`SIGTERM`), the bot must:
1. Stop accepting new signals
2. NOT cancel open positions (let them run until the process is actually killed)
3. The position monitor state is already persisted in DB, so on restart it loads and resumes

```typescript
process.on("SIGTERM", () => {
  botController.pause(); // stop new signals
  // positions continue in DB; monitor restarts on next boot
  server.close(() => process.exit(0));
});
```

### Market Hours Awareness

The bot controller checks time-of-day and automatically pauses outside 4:00 AM–4:00 PM ET (pre-market and post-market). The existing `getTodBucket()` in `catalystClassifier.ts` provides the time-of-day logic. A simple interval every minute checks if the market window has opened/closed.

---

## Database Schema Changes

### New Table: BotTrade

Replaces or parallels `PaperTrade`. The key addition is a `mode` field and Alpaca's broker order IDs for live orders.

```prisma
model BotTrade {
  id               String   @id @default(cuid())
  mode             String   // "paper" | "live"
  ticker           String
  qty              Int

  // Entry
  entryOrderId     String?  // Alpaca order ID for the buy
  entryPrice       Float?
  entryOrderStatus String   // "PENDING" | "FILLED" | "ERROR"
  enteredAt        DateTime?

  // Exit
  exitOrderId      String?  // Alpaca order ID for the sell
  exitPrice        Float?
  exitOrderStatus  String?  // "PENDING" | "FILLED" | "ERROR"
  exitReason       String?  // "trailing_stop" | "profit_target" | "hold_deadline" | "manual" | "circuit_breaker"
  exitedAt         DateTime?

  // Position state (persisted for crash recovery)
  status           String   // "PENDING_ENTRY" | "OPEN" | "PENDING_EXIT" | "CLOSED" | "ERROR"
  peakPrice        Float?   // highest price seen while open

  // Strategy parameters used (snapshot at entry time)
  trailingStopPct  Float?
  profitTargetPct  Float?
  holdDeadlineSec  Int?

  // Signal context
  catalyst         String   // news headline
  catalystCategory String
  catalystTier     Int
  scannerId        String?

  // Risk
  pnl              Float?
  returnPct        Float?

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([status])
  @@index([mode])
  @@index([ticker])
}
```

### New Table: BotConfig

Persisted bot configuration. One row (singleton pattern via upsert on a fixed ID).

```prisma
model BotConfig {
  id                String   @id @default("default")
  enabled           Boolean  @default(false)
  mode              String   @default("paper")   // "paper" | "live"
  enabledTiers      Int[]    @default([1, 2])    // which catalyst tiers to trade
  maxPositions      Int      @default(3)
  positionSizeUsd   Float    @default(1000)
  dailyLossLimitUsd Float    @default(500)
  minWinRate        Float    @default(0.5)       // minimum strategy win rate to trade
  minConfidence     Float    @default(0.3)       // minimum strategy confidence score
  updatedAt         DateTime @updatedAt
}
```

### New Table: BotDailyStats

For circuit breaker persistence across process restarts.

```prisma
model BotDailyStats {
  id          String   @id @default(cuid())
  date        String   // "YYYY-MM-DD" in ET
  totalPnl    Float    @default(0)
  tradeCount  Int      @default(0)
  winCount    Int      @default(0)
  circuitOpen Boolean  @default(false)  // true = daily loss limit hit
  updatedAt   DateTime @updatedAt

  @@unique([date])
}
```

---

## Patterns to Follow

### Pattern 1: Event-Driven Signal Dispatch (not polling)

**What:** News services (`rtpr.ts`, `benzinga.ts`) already call `getActiveScannersForTicker()` and `executePaperTrade()`. Replace/extend the `executePaperTrade` call with a call to `botSignalEngine.evaluateNewsSignal()`.

**Why:** The existing wiring is the correct integration point. News arrives → classification happens immediately → decision is synchronous. No new event emitter infrastructure needed.

**Implementation:** Extend the existing `handleMessage` in `rtpr.ts`:
```typescript
// After broadcast("news", ...)
const activeScanners = getActiveScannersForTicker(article.ticker);
if (activeScanners.length > 0) {
  // Existing paper trader (keep for backward compat or remove when bot matures)
  executePaperTrade(article, activeScanners).catch(...);
  // New bot signal engine
  botSignalEngine.evaluateNewsSignal(article, activeScanners).catch(...);
}
```

### Pattern 2: Non-Blocking Broadcast for Bot Activity

**What:** All bot state changes (new signal evaluated, order placed, fill received, exit triggered) call `broadcast(channel, payload)` from the existing `clientHub.ts`. Never `await` a broadcast in the hot path.

**Why:** Prevents a slow or disconnected WebSocket client from blocking trade execution. The `broadcast()` function already iterates clients synchronously (no await) so it's safe to call anywhere.

**Channels to add:**
- `"bot:status"` — bot controller state changes (started, paused, circuit breaker tripped)
- `"bot:trade"` — trade lifecycle events (signal evaluated, order placed, filled, closed)
- `"bot:position"` — per-position price updates (price, P&L %, exit condition status)

### Pattern 3: Optimistic DB Write Before Network Call

**What:** Before placing any Alpaca order, insert the `BotTrade` record with status `PENDING_ENTRY`. If the process crashes after the DB write but before the API call, on restart the record is visible for manual inspection.

**Why:** Order state that exists only in memory is lost on crash. Persisting before the API call ensures no "ghost trades" (executed at Alpaca but unknown to the system).

### Pattern 4: Singleton Position Monitor Map

**What:** An in-process `Map<tradeId, PositionState>` tracks all active positions. `positionMonitor.ts` owns this map. On startup, the bot controller calls `positionMonitor.loadOpenPositions()` which queries the DB for `status: "OPEN"` records and populates the map, restarting setInterval monitors.

**Why:** The monitor needs fast in-memory access to `peakPrice` and exit parameters on every 5-second poll. Reading from DB on every poll would be excessive.

**Crash recovery:** DB is the source of truth. Memory is a cache. On restart, DB wins.

### Pattern 5: Config-Driven Mode Switch (Paper vs Live)

**What:** A single config field `BOT_MODE=paper|live` in `.env` determines which Alpaca base URL and which API keys to use. The executor module reads this at startup and constructs the appropriate HTTP client.

**Why:** Code parity between paper and live is the entire point. No if/else throughout the codebase — just one URL difference at construction time.

```typescript
// botClient.ts
const BOT_BASE_URL = config.botMode === "live"
  ? "https://api.alpaca.markets"
  : "https://paper-api.alpaca.markets";
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Sharing paperTrader.ts activePositions with Bot

**What goes wrong:** Reusing `paperTrader.ts` for bot execution means the same `activePositions` Map and `recentTrades` cooldown apply to both manual paper trades and autonomous bot trades. They interfere.

**Why bad:** The bot may be paused but the paper trader still fires. The cooldown map is shared so a bot trade suppresses a manual paper entry. Analytics are mixed.

**Instead:** `tradeExecutor.ts` and `positionMonitor.ts` are new modules with their own state. Paper trader stays untouched for manual paper trades. Separate DB tables (`BotTrade` vs `PaperTrade`) keep analytics clean.

### Anti-Pattern 2: Blocking the News Handler on Order Execution

**What goes wrong:** `await executeBotTrade(article)` in the `handleMessage()` callback. Alpaca order placement takes 100-500ms. During this time, new news messages from the WebSocket buffer.

**Why bad:** WebSocket messages from RTPR/Benzinga queue up. A burst of 5 news items arrives, the first triggers order placement, and by the time the await resolves, 4 more items have been missed or processed late.

**Instead:** Fire-and-forget pattern with error capture:
```typescript
botSignalEngine.evaluateNewsSignal(article, scannerIds).catch(err =>
  console.error("[Bot] Signal evaluation error:", err)
);
```

### Anti-Pattern 3: No Daily Loss Reset

**What goes wrong:** The daily P&L accumulator in `riskManager.ts` never resets. After a bad trading day, the circuit breaker stays open forever.

**Why bad:** The bot stops trading permanently after hitting the daily loss limit once.

**Instead:** The risk manager checks the current ET date on each evaluation. If the stored date in `BotDailyStats` is yesterday or earlier, it creates a new row and resets in-memory counters.

### Anti-Pattern 4: Bracket Orders as the Only Exit Strategy

**What goes wrong:** Using only Alpaca bracket orders (fixed stop + fixed target) without the position monitor. The strategy engine recommends trailing stops, not fixed stops.

**Why bad:** A trailing stop moves up as the price rises, capturing more gain. A fixed stop loss set at entry doesn't adjust. The strategy engine's primary output is `trailingStopPct`, which bracket orders cannot express.

**Instead:** Use simple market orders for entry, then manage exit entirely in `positionMonitor.ts` with the trailing stop logic (already implemented in `paperTrader.ts` — copy to the new module). Bracket orders can be offered as a future simplification for fixed-risk setups.

### Anti-Pattern 5: Persisting Mode in BotConfig but Switching It at Runtime

**What goes wrong:** Allowing the UI to switch `mode` from "paper" to "live" while positions are open. Existing open positions were placed against the paper account; the mode switch means the system tries to sell them from the live account.

**Why bad:** Cross-account position mismatch. The system thinks it's closing a position, but the live account has no such position.

**Instead:** Mode can only be changed when no positions are open. `botController.ts` enforces this check before accepting a mode change via the REST endpoint.

---

## Build Order (Phase Dependencies)

The implementation follows a strict dependency order. Later components depend on earlier ones being stable.

```
Phase 1: Bot Infrastructure Foundation
├── BotTrade + BotConfig + BotDailyStats DB schema + migration
├── botController.ts (lifecycle only, no trading)
├── riskManager.ts (counters only, no enforcement yet)
└── REST routes: GET /api/bot/status, POST /api/bot/start|pause|stop

Phase 2: Signal Engine (reads from existing services, no orders yet)
├── botSignalEngine.ts (classifier + strategy + risk gate → log signal)
├── Integration hook in rtpr.ts and benzinga.ts (fire-and-forget)
└── Verify: signals logged but no orders placed

Phase 3: Trade Executor + Position Monitor (paper mode)
├── tradeClient.ts (Alpaca REST wrapper, paper URL)
├── tradeExecutor.ts (place buy, wait for fill, record BotTrade)
├── positionMonitor.ts (trailing stop, time limit, sell)
├── Crash recovery: loadOpenPositions() on startup
└── Broadcast: bot:trade, bot:position channels to clientHub

Phase 4: Risk Management Enforcement
├── riskManager enforces max positions, daily loss limit
├── BotDailyStats daily reset logic
└── Circuit breaker broadcast to frontend

Phase 5: Frontend Bot Dashboard Panel
├── Subscribe to bot:trade, bot:position, bot:status channels
├── Active positions table with live P&L
├── Bot controls (pause/resume/stop)
└── Config panel (tiers, position size, limits)

Phase 6: Live Trading Mode
├── Add live URL to config
├── BotConfig mode field + UI mode switch (guarded)
└── Integration test with $1 live orders
```

---

## Integration Points with Existing Services

| Existing Service | Integration Point | What Changes |
|------------------|------------------|--------------|
| `rtpr.ts` | After `broadcast("news", ...)` and `getActiveScannersForTicker()` | Add `botSignalEngine.evaluateNewsSignal()` call |
| `benzinga.ts` | Same pattern as rtpr.ts | Same addition |
| `scanner.ts` | `getActiveScannersForTicker()` already exported | No change — bot reads scanner state through existing function |
| `catalystClassifier.ts` | `classifyCatalystGranular()` already exported | No change — bot calls it directly |
| `strategyEngine.ts` | `getStrategy()` already exported | No change — bot calls it directly |
| `clientHub.ts` | `broadcast()` already exported | Add new bot channels; no structural change |
| `alpaca.ts` | `getSnapshots()` already exported | No change — positionMonitor reuses it for price polling |
| `index.ts` | Server startup sequence | Add `await startBotController()` at end of startup |
| Prisma schema | New models: BotTrade, BotConfig, BotDailyStats | New migration; no changes to existing models |

---

## Scalability Considerations

| Concern | Current (< 5 concurrent positions) | Future (10+ positions) |
|---------|-------------------------------------|------------------------|
| Price polling | `getSnapshots()` batches all tickers in one REST call | Already batched — no change needed |
| Order fill detection | Poll `GET /v2/orders/:id` every 2s | Switch to Alpaca order update WebSocket stream |
| DB writes | One UPDATE per 5s per position | Fine up to ~50 positions; add write batching beyond that |
| Memory | `activePositions` Map in process | Fine for hundreds of positions |
| Bot signals | Synchronous check in news handler | Fine for news rates seen (< 10/min typically) |

The architecture handles the expected load (1-5 concurrent positions, < 10 news events/minute during active sessions) without any changes. The first optimization needed — if concurrency grows — is switching fill detection from REST polling to the order update WebSocket stream.

---

## Confidence Assessment

| Area | Confidence | Source | Notes |
|------|------------|--------|-------|
| Existing service wiring | HIGH | Source code read | Full codebase reviewed |
| Alpaca paper vs live URL difference | HIGH | Official docs | `paper-api.alpaca.markets` vs `api.alpaca.markets` |
| Alpaca bracket order structure | HIGH | Official docs | Verified at docs.alpaca.markets/docs/orders-at-alpaca |
| Alpaca order update WebSocket | HIGH | Official docs | Verified at docs.alpaca.markets/docs/websocket-streaming |
| Trailing stop as bracket component | HIGH | Official docs | Explicitly noted as NOT supported in bracket orders |
| Bot module boundaries | HIGH | Architecture reasoning from codebase | Derived from existing patterns |
| Crash recovery via DB | MEDIUM | Standard pattern | No Alpaca-specific constraint — general Node.js pattern |
| Live trading API behavior | MEDIUM | Official docs confirm structure | Not tested; paper mode is identical code path |

---

## Sources

- Alpaca Markets order types: https://docs.alpaca.markets/docs/orders-at-alpaca
- Alpaca WebSocket streaming: https://docs.alpaca.markets/docs/websocket-streaming
- Alpaca paper trading endpoint: https://docs.alpaca.markets/docs/paper-trading
- Alpaca order placement reference: https://docs.alpaca.markets/reference/postorder
- Existing source code: `c:/Projects/StockNews/backend/src/` (fully read)
