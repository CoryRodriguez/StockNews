# Phase 3: Trade Executor and Position Monitor - Research

**Researched:** 2026-02-28
**Domain:** Alpaca Trading API (REST + WebSocket), position lifecycle management, Node.js async patterns
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Position Sizing — flat dollar amounts per star rating:**
- 3-star signal → $50
- 4-star signal → $75
- 5-star signal → $100
- 1–2 star (low confidence) → skip entirely, do not enter trade

**Storage:** All dollar amounts stored in BotConfig table (database), fully configurable without code changes.

**Position Limits:** No cap on simultaneous open positions. Trade every qualifying signal (3+ stars).

**Duplicate Signals:** If the bot receives a second signal for a symbol it already has an open position in, skip it. Silent skip — no DB write.

**Exit Conditions (all configurable via BotConfig):**
| Exit Type | BotConfig Key | Notes |
|-----------|---------------|-------|
| Hard stop loss | `stopLossPct` | e.g. -5% from entry. Immediate market sell. |
| Profit target | `profitTargetPct` | e.g. +10% from entry. Lock in gains. |
| Max hold time | `maxHoldMinutes` | Time-based exit regardless of P&L. |

**EOD Force-Close:** Always force-close all positions at 3:45 PM ET. No exceptions, no toggle. Uses `node-cron`.

**Crash Recovery:** On startup, reconcile DB state against live Alpaca positions via `GET /v2/positions`.
- Orphan positions (in Alpaca but no DB record) → log warning + import as tracked positions
- DB positions with no Alpaca counterpart → mark as closed with `exitReason: 'reconciled_missing_on_startup'`

### Claude's Discretion

Trailing stop is listed as a future concern ("May add trailing stop logic; defer to config too") — Phase 3 does NOT implement trailing stop. The signal engine already returns `rejectReason: "log-only"` for fired signals; Phase 3 removes that placeholder and places real orders.

### Deferred Ideas (OUT OF SCOPE)

- PDT rule enforcement → Phase 4 (Risk Management)
- Capital allocation limits / max daily loss → Phase 4
- Live trading mode → Phase 6
- UI / dashboard for viewing trades → Phase 5
- Catalyst analytics / which news type drives biggest moves → Phase 5
- Trailing stop implementation → future (may add per config)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXEC-01 | Bot places market buy orders on Alpaca paper trading API when signal conditions are met | Alpaca POST /v2/orders with `notional` field; paper URL = `https://paper-api.alpaca.markets` |
| EXEC-02 | Bot confirms order fills via Alpaca trading WebSocket stream (real-time, not polling) | Alpaca trading WebSocket at `wss://paper-api.alpaca.markets/stream`, subscribe to `trade_updates` |
| EXEC-03 | Bot handles partial fills — reconciles position quantity from Alpaca's position endpoint after every fill event | GET /v2/positions/{symbol} returns `qty`, `avg_entry_price`, `current_price`; use after partial_fill events |
| EXEC-04 | Bot logs and handles all Alpaca order rejection scenarios without crashing | `rejected` event arrives over trade_updates WebSocket; order object includes `status: "rejected"` |
| EXEC-05 | Bot uses dollar-notional position sizing (configurable dollar amount per trade) | POST /v2/orders with `notional` field (number); `qty` and `notional` are mutually exclusive |
| EXEC-06 | Bot fires trade execution asynchronously — news handler never blocked | Wrap `tradeExecutor.execute(signal)` in `void executeAsync()` — fire-and-forget, never await in signal pipeline |
| EXEC-07 | Confidence-tiered sizing: star-rating determines notional amount from BotConfig | `getBotConfig().tradeSizeStars3/4/5`; 1-2 star = skip; read existing `aiConfidence` from signal evaluation |
| EXIT-01 | Hard stop loss — triggers immediately regardless of peak price | Position monitor polls every 5s using existing `getSnapshots()`; stop = (currentPrice - entryPrice) / entryPrice * 100 |
| EXIT-02 | Trailing stop — trails peak price using strategy engine per-category trailing stop % | `getStrategy(catalystCategory)` returns `trailingStopPct`; track `peakPrice` in-memory per position |
| EXIT-03 | Profit target exit — uses strategy engine per-category hold duration and performance data | `getStrategy(catalystCategory)` returns suggested hold; `profitTargetPct` from BotConfig; exit when met |
| EXIT-04 | Time-based forced exit — configurable max hold duration | `maxHoldMinutes` from BotConfig; `setTimeout` from entryAt timestamp |
| EXIT-05 | Force-close all positions at 3:45 PM ET via node-cron | `cron.schedule('45 15 * * 1-5', handler, { timezone: 'America/New_York' })` — weekdays only |
| EXIT-06 | Monitor open positions via price polling every 5 seconds using existing price tracking infrastructure | `setInterval(checkExits, 5000)` using `getSnapshots([...openSymbols])` — already used by paperTrader |
</phase_requirements>

---

## Summary

Phase 3 converts the signal engine from "log-only" mode into a real order execution system. The primary technical work is: (1) a `tradeExecutor.ts` service that places notional market buy orders on Alpaca paper API asynchronously and persists `BotTrade` records, (2) a second WebSocket connection to the Alpaca trading stream (distinct from the existing market data stream) that receives fill/partial-fill/rejected events, and (3) a `positionMonitor.ts` service that polls open positions every 5 seconds and enforces all exit conditions.

The existing codebase provides strong foundations: `botController.ts` has the `BotTrade` schema, `getAlpacaBaseUrl()`, `getBotConfig()`, and `reconcilePositions()`. The `paperTrader.ts` already implements the order placement, trailing stop polling, and sell execution patterns to use as a reference. The signal engine's `evaluateBotSignal()` already concludes with `outcome: "fired"` / `rejectReason: "log-only"` — Phase 3 removes the log-only placeholder and fires the trade executor.

The main integration risks are: (1) the BotConfig schema has `hardStopLossPct`, `maxHoldDurationSec`, `positionSizeUsd`, and confidence multipliers — but NOT the star-rating flat amounts (`tradeSizeStars3/4/5`) or `profitTargetPct` — those fields need a new migration; (2) the trading WebSocket URL is different from the market data WebSocket URL and requires separate authentication; (3) partial fill handling requires reconciling against `GET /v2/positions/{symbol}` after every partial_fill event rather than trusting WebSocket qty fields alone.

**Primary recommendation:** Build three focused files — `tradeExecutor.ts` (async order placement), `positionMonitor.ts` (exit loop), `tradingWs.ts` (Alpaca trading WebSocket) — then wire them into `signalEngine.ts` (replace log-only) and `botController.ts`/`index.ts` (startup reconciliation).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node-cron` | already in deps (Phase 1 decision) | 3:45 PM ET force-close + 4 AM reset | Already committed; only new dep from Phase 1 research |
| `ws` | already in use | Trading WebSocket connection to Alpaca stream | Already used for market data; same pattern for trading stream |
| `@prisma/client` | already in use | BotTrade CRUD — open/close position records | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fetch` (Node 18 built-in) | built-in | REST calls to Alpaca: POST /v2/orders, GET /v2/positions | Already used throughout codebase (paperTrader, botController) |

### No New Dependencies Required

All libraries needed for Phase 3 are already installed. The only new work is:
- One Prisma migration to add `tradeSizeStars3`, `tradeSizeStars4`, `tradeSizeStars5`, `profitTargetPct` fields to `BotConfig`
- Three new service files in `backend/src/services/`

**Installation:**
```bash
# No new packages needed — node-cron was added in Phase 1
```

---

## Architecture Patterns

### Recommended Project Structure

```
backend/src/services/
├── tradeExecutor.ts     # NEW: async order placement, BotTrade DB writes
├── positionMonitor.ts   # NEW: 5s polling loop, exit logic, sell orders
├── tradingWs.ts         # NEW: Alpaca trading WebSocket (fill/rejected events)
├── botController.ts     # MODIFY: add new BotConfig fields, update reconcilePositions() for orphan import
├── signalEngine.ts      # MODIFY: replace "log-only" path with tradeExecutor.execute() call
├── paperTrader.ts       # REFERENCE: existing order placement patterns (do not modify)
└── ...existing services...

backend/prisma/
├── schema.prisma        # MODIFY: add tradeSizeStars3/4/5, profitTargetPct to BotConfig
└── migrations/
    └── 20260228000002_add_bot_config_sizing_fields/
        └── migration.sql  # NEW
```

### Pattern 1: Fire-and-Forget Trade Execution (EXEC-06)

**What:** Signal engine calls `void executeTradeAsync(signal)` — never awaits, never blocks news handler.
**When to use:** Any time a "fired" outcome exits `evaluateBotSignal`.

```typescript
// In signalEngine.ts (replacing the "log-only" path):
// Source: STATE.md architecture decision — "Fire-and-forget signal evaluation"
// After writeSignalLog() with outcome: "fired"
void executeTradeAsync({
  symbol,
  catalystCategory: classification.category,
  catalystTier: classification.tier,
  aiConfidence: aiResult?.confidence ?? null,
  priceAtSignal: snap.price,
}).catch((err) =>
  console.error('[SignalEngine] executeTradeAsync error:', err instanceof Error ? err.message : err)
);
```

### Pattern 2: Notional Market Buy Order (EXEC-01, EXEC-05)

**What:** POST /v2/orders with `notional` instead of `qty`. Dollar amount from BotConfig per star rating.
**Source:** Alpaca official docs — https://docs.alpaca.markets/reference/postorder

```typescript
// Source: Alpaca POST /v2/orders documentation
// In tradeExecutor.ts
interface AlpacaOrderRequest {
  symbol: string;
  notional: number;    // dollar amount — mutually exclusive with qty
  side: 'buy' | 'sell';
  type: 'market';
  time_in_force: 'day';
}

interface AlpacaOrderResponse {
  id: string;
  status: string;         // "new" | "accepted" | "pending_new" | "filled" | "rejected"
  symbol: string;
  notional: string | null;
  qty: string | null;     // null when order was submitted with notional
  filled_qty: string;     // shares actually filled
  filled_avg_price: string | null;
  side: string;
  created_at: string;
}

async function placeMarketBuy(symbol: string, notionalUsd: number): Promise<AlpacaOrderResponse> {
  const res = await fetch(`${getAlpacaBaseUrl()}/v2/orders`, {
    method: 'POST',
    headers: {
      'APCA-API-Key-ID': config.alpacaApiKey,
      'APCA-API-Secret-Key': config.alpacaApiSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      symbol,
      notional: notionalUsd,
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca buy order failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<AlpacaOrderResponse>;
}
```

### Pattern 3: Alpaca Trading WebSocket (EXEC-02, EXEC-04)

**What:** Second WebSocket connection (separate from market data stream) for fill/partial_fill/rejected events.
**Source:** https://docs.alpaca.markets/docs/websocket-streaming

```typescript
// Source: Alpaca trading WebSocket documentation
// In tradingWs.ts — SEPARATE from the market data WebSocket in alpaca.ts

// URLs:
// Paper: wss://paper-api.alpaca.markets/stream
// Live:  wss://api.alpaca.markets/stream
// Note: URL is mode-dependent; use getAlpacaBaseUrl() to derive it

// Step 1: Auth message (send immediately after connection open)
const authMsg = {
  action: 'auth',
  key: config.alpacaApiKey,
  secret: config.alpacaApiSecret,
};

// Step 2: Subscribe to trade_updates (send after auth confirmed)
const subscribeMsg = {
  action: 'listen',
  data: { streams: ['trade_updates'] },
};

// Step 3: Message schema
interface TradingWsMessage {
  stream: 'trade_updates' | 'authorization' | 'listening';
  data: TradeUpdate | AuthResult | ListenResult;
}

interface TradeUpdate {
  event: 'fill' | 'partial_fill' | 'rejected' | 'new' | 'canceled' | 'expired' | 'done_for_day';
  timestamp: string;          // ISO 8601
  price?: string;             // price per share for this fill event
  qty?: string;               // shares for this fill event (may differ from order filled_qty)
  position_qty?: string;      // total position size after event (signed: positive = long)
  order: AlpacaOrderResponse; // full order object including id, symbol, filled_qty, filled_avg_price
}
```

### Pattern 4: Position Reconciliation on Fill (EXEC-03)

**What:** After every `partial_fill` event, call `GET /v2/positions/{symbol}` to get authoritative share count.
**Why:** WebSocket `qty` in partial_fill is "shares for THIS fill event" — not total filled quantity. Positions endpoint is authoritative.

```typescript
// Source: Alpaca positions documentation — qty, avg_entry_price, current_price
interface AlpacaPosition {
  symbol: string;
  qty: string;                  // total shares held (string — parse with parseFloat)
  avg_entry_price: string;      // average entry price
  current_price: string;        // current market price
  market_value: string;         // qty * current_price
  unrealized_pl: string;        // dollar P&L
  unrealized_plpc: string;      // % P&L
  side: 'long' | 'short';
  cost_basis: string;
}

async function getPositionQty(symbol: string): Promise<number | null> {
  const res = await fetch(`${getAlpacaBaseUrl()}/v2/positions/${encodeURIComponent(symbol)}`, {
    headers: {
      'APCA-API-Key-ID': config.alpacaApiKey,
      'APCA-API-Secret-Key': config.alpacaApiSecret,
    },
  });
  if (res.status === 404) return null; // no position
  if (!res.ok) return null;
  const pos = await res.json() as AlpacaPosition;
  return parseFloat(pos.qty);
}
```

### Pattern 5: EOD Force-Close via node-cron (EXIT-05)

**What:** Schedule forced sell of all open positions at 3:45 PM ET, Monday-Friday.
**Source:** node-cron documentation, confirmed via web search.

```typescript
// Source: node-cron docs + web search verification
import cron from 'node-cron';

// '45 15 * * 1-5' = 3:45 PM, Monday-Friday
// timezone option ensures DST-safe execution
cron.schedule('45 15 * * 1-5', async () => {
  console.log('[PositionMonitor] EOD force-close triggered');
  await forceCloseAllPositions('force_close_eod');
}, { timezone: 'America/New_York' });
```

### Pattern 6: Position Monitor Exit Loop (EXIT-01, EXIT-02, EXIT-03, EXIT-04, EXIT-06)

**What:** `setInterval` polling every 5 seconds; checks hard stop, profit target, max hold time for each open BotTrade.
**Source:** paperTrader.ts existing pattern — this is the same architecture already in production.

```typescript
// Reference: paperTrader.ts startTrailingStopMonitor() — same polling architecture
// In positionMonitor.ts

interface TrackedPosition {
  tradeId: string;        // BotTrade.id
  symbol: string;
  entryPrice: number;
  entryAt: Date;
  peakPrice: number;      // tracked for trailing stop
  shares: number;         // updated after partial fills
  catalystCategory: string;
}

const openPositions = new Map<string, TrackedPosition>(); // keyed by BotTrade.id

const POLL_INTERVAL_MS = 5000;

setInterval(async () => {
  if (openPositions.size === 0) return;
  const symbols = [...openPositions.values()].map(p => p.symbol);
  const snapshots = await getSnapshots(symbols);
  const config = getBotConfig();

  for (const snap of snapshots) {
    const positions = [...openPositions.values()].filter(p => p.symbol === snap.ticker);
    for (const pos of positions) {
      // Update peak (for trailing stop)
      if (snap.price > pos.peakPrice) pos.peakPrice = snap.price;

      const pctChange = (snap.price - pos.entryPrice) / pos.entryPrice * 100;
      const holdMinutes = (Date.now() - pos.entryAt.getTime()) / 60000;

      // EXIT-01: Hard stop loss
      if (pctChange <= -(config.stopLossPct ?? 5)) {
        await closePosition(pos, snap.price, 'hard_stop');
        continue;
      }
      // EXIT-03: Profit target
      if (pctChange >= (config.profitTargetPct ?? 10)) {
        await closePosition(pos, snap.price, 'profit_target');
        continue;
      }
      // EXIT-04: Max hold time
      if (holdMinutes >= (config.maxHoldMinutes ?? 30)) {
        await closePosition(pos, snap.price, 'time_exit');
        continue;
      }
      // EXIT-02: Trailing stop (future — config key will be added later)
    }
  }
}, POLL_INTERVAL_MS);
```

### Pattern 7: Orphan Position Import on Crash Recovery (enhanced reconcilePositions)

**What:** On startup, if Alpaca has a position with no BotTrade record, import it as a tracked position.
**Source:** CONTEXT.md — "Log a warning and import them as tracked positions."

```typescript
// MODIFY botController.ts reconcilePositions() to handle orphans
// For orphan positions found in Alpaca but not in DB:
const orphanTrade = await prisma.botTrade.create({
  data: {
    symbol: livePos.symbol,
    entryPrice: parseFloat(livePos.avg_entry_price),
    shares: parseFloat(livePos.qty),
    status: 'open',
    exitReason: null,
    alpacaOrderId: null,  // unknown — was orphan
    catalystType: 'unknown',
    catalystTier: null,
    entryAt: new Date(),  // approximate — actual entry time unknown
  },
});
console.warn(`[BotController] Orphan position imported: ${livePos.symbol} qty=${livePos.qty}`);
// positionMonitor.addPosition() must be called after reconcilePositions() completes
```

### Pattern 8: Star-Rating Sizing (EXEC-07 — from CONTEXT.md)

**What:** Map AI confidence + catalyst tier to dollar notional amount from BotConfig.
**Decision:** 3-star = $50, 4-star = $75, 5-star = $100; 1-2 star = skip.

The `signalEngine.ts` currently returns `aiConfidence: "high" | "medium" | "low"` in the signal log. The mapping from "star rating" to confidence:
- 5-star (high confidence): tier 1-2 signal, or tier 3-4 with AI `confidence: "high"` → `tradeSizeStars5`
- 4-star (medium confidence): tier 3-4 with AI `confidence: "medium"` → `tradeSizeStars4`
- 3-star (low confidence from AI but still approved): tier 3-4 with AI `confidence: "low"` + proceed=true → `tradeSizeStars3`
- 1-2 star (not approved): AI declined or unavailable → skip entirely

```typescript
// In tradeExecutor.ts
function getNotionalAmount(
  tier: number,
  aiConfidence: 'high' | 'medium' | 'low' | null
): number | null {
  const cfg = getBotConfig();
  // Tier 1-2: always high confidence (fastest catalyst categories)
  if (tier <= 2) return cfg.tradeSizeStars5;
  // Tier 3-4: AI confidence determines size
  if (aiConfidence === 'high') return cfg.tradeSizeStars5;
  if (aiConfidence === 'medium') return cfg.tradeSizeStars4;
  if (aiConfidence === 'low') return cfg.tradeSizeStars3;
  // null = ai-unavailable/ai-timeout = skip (1-2 star)
  return null;
}
```

### Anti-Patterns to Avoid

- **Blocking the news handler:** Never `await` tradeExecutor in news service callbacks. Always `void executeAsync()`.
- **Trusting WebSocket qty for position sizing:** After partial_fill, always call `GET /v2/positions/{symbol}` for authoritative qty.
- **Using a single Alpaca WebSocket for both market data and trading:** The trading stream (`/stream`) is a completely different endpoint from the market data stream (`/v2/iex`). Do not mix them.
- **Hardcoding percentages:** All exit thresholds (`stopLossPct`, `profitTargetPct`, `maxHoldMinutes`) live in BotConfig DB only.
- **Market sell without try/catch:** Sell order failures must be caught and logged without crashing the monitor loop.
- **Placing orders outside market hours:** Phase 3 inherits `isMarketOpen()` from botController — position monitor should also guard sell orders with this check, or use time-based logic for pre-market situations.
- **Not using `sold` guard flag:** Must set `sold = true` immediately before executing sell to prevent double-exits (same race condition protection in paperTrader.ts).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | Custom setInterval + date math for 3:45 PM ET | `node-cron` with `timezone: 'America/New_York'` | DST transitions corrupt naive UTC math; node-cron handles this |
| Order placement pattern | New fetch utilities | Reference `paperTrader.ts` placeOrder() pattern | Already proven in production; same headers, same error handling |
| Position poll pattern | New timer architecture | Reference `paperTrader.ts` startTrailingStopMonitor() | Already handles peakPrice tracking, poll interval, sold guard |
| WebSocket reconnect | Custom reconnect logic | Mirror `alpaca.ts` reconnectTimer pattern | Already handles backoff, re-subscribe on reconnect |
| Fractional shares | Custom qty calculation | Send `notional` directly to Alpaca | Alpaca handles fractional math; don't compute shares yourself |
| TimeZone math | Custom offset calculations | Use `Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })` | Already used in `botController.ts` `getTodayDateET()` |

**Key insight:** The existing `paperTrader.ts` is a complete reference implementation. Phase 3 is effectively "port paperTrader to use BotTrade instead of PaperTrade, add the trading WebSocket, and add all four exit conditions."

---

## Common Pitfalls

### Pitfall 1: Trading WebSocket URL is Mode-Dependent

**What goes wrong:** Using the paper trading WebSocket URL in live mode (or vice versa) causes all order events to be missed silently — orders fill in one environment, events arrive in another.
**Why it happens:** `wss://paper-api.alpaca.markets/stream` (paper) vs `wss://api.alpaca.markets/stream` (live) are completely separate.
**How to avoid:** Derive the WebSocket URL from `getAlpacaBaseUrl()`:
```typescript
// Derive trading WS URL from the REST base URL
const wsUrl = getAlpacaBaseUrl()
  .replace('https://', 'wss://')
  .replace('http://', 'ws://') + '/stream';
```
**Warning signs:** No fill events arriving after order is placed.

### Pitfall 2: BotConfig Missing Required Fields for Phase 3

**What goes wrong:** `BotConfig` in schema.prisma has `hardStopLossPct`, `maxHoldDurationSec`, and `positionSizeUsd` (for old sizing) but does NOT have `tradeSizeStars3`, `tradeSizeStars4`, `tradeSizeStars5`, or `profitTargetPct`. Building against missing fields causes TypeScript errors or silent use of undefined.
**Why it happens:** BotConfig was designed before CONTEXT.md locked the star-rating flat amounts approach.
**How to avoid:** Migration must add these fields BEFORE any executor code is written:
```sql
ALTER TABLE "BotConfig" ADD COLUMN "tradeSizeStars3" FLOAT NOT NULL DEFAULT 50;
ALTER TABLE "BotConfig" ADD COLUMN "tradeSizeStars4" FLOAT NOT NULL DEFAULT 75;
ALTER TABLE "BotConfig" ADD COLUMN "tradeSizeStars5" FLOAT NOT NULL DEFAULT 100;
ALTER TABLE "BotConfig" ADD COLUMN "profitTargetPct" FLOAT NOT NULL DEFAULT 10;
```
**Warning signs:** TypeScript shows `Property 'tradeSizeStars3' does not exist on type 'BotConfigRecord'`.

### Pitfall 3: Notional Order — qty vs notional in Response

**What goes wrong:** When an order is placed with `notional`, the response's `qty` field is null. Trying to track shares by reading `order.qty` gives null.
**Why it happens:** Alpaca's API is explicit: notional and qty are mutually exclusive. The order entity omits `qty` when submitted with `notional`.
**How to avoid:** After a fill event, read `filled_qty` (from the order object in the WebSocket event) for shares held. For partial fills, call `GET /v2/positions/{symbol}` for authoritative qty.

### Pitfall 4: Race Condition — Double Exit

**What goes wrong:** Hard stop fires at the same time as a fill event or EOD close. Two separate sell orders get placed.
**Why it happens:** The 5-second poll, the timeout handler, and the EOD cron all run asynchronously.
**How to avoid:** Use a `sold` boolean flag on each tracked position (same as `paperTrader.ts`). Set it synchronously before any async sell operation.

### Pitfall 5: Orphan Positions Must Be Monitored Immediately

**What goes wrong:** `reconcilePositions()` imports orphan positions into DB but `positionMonitor` doesn't know about them yet (its in-memory map is empty).
**Why it happens:** `reconcilePositions()` runs in `initBot()` before `startPositionMonitor()` is called, but there's no callback to hydrate the in-memory map.
**How to avoid:** `reconcilePositions()` (or `initBot()`) must call `positionMonitor.addPosition()` for each imported orphan AND for each existing open BotTrade after startup, so the monitor's in-memory state is warm.

### Pitfall 6: Partial Fill — Shares vs Notional

**What goes wrong:** A $50 order is partially filled (only some shares allocated). The `position_qty` in the WebSocket event may be a fraction. If the bot calculates P&L using the wrong share count, exit thresholds can fire at wrong levels.
**Why it happens:** Paper trading fills orders at best available price; partial fills can occur ~10% of the time.
**How to avoid:** After every `partial_fill` event, call `GET /v2/positions/{symbol}` and update the `shares` field on the tracked position with the authoritative `parseFloat(position.qty)`.

### Pitfall 7: node-cron Weekday-Only Guard

**What goes wrong:** Cron fires on weekends and attempts to close positions that don't exist (or worse, re-fires on a Monday after a crash).
**Why it happens:** `'45 15 * * *'` fires every day including weekends. Paper market doesn't trade on weekends.
**How to avoid:** Use `'45 15 * * 1-5'` (Monday-Friday only) with `{ timezone: 'America/New_York' }`.

### Pitfall 8: Alpaca Rate Limits — 200 req/min

**What goes wrong:** Position monitor polls every 5 seconds for each open position. With many open positions, each triggering a `GET /v2/positions/{symbol}` call after partial fills, the 200 req/min limit could be hit.
**Why it happens:** 200 req/min = ~3.3 req/sec burst; position monitor + fill reconciliation + sell orders all count.
**How to avoid:** Batch the main position poll: `getSnapshots([...allOpenSymbols])` is ONE request (market data API has separate limits). Only call individual `GET /v2/positions/{symbol}` when a partial_fill event fires (not on every poll cycle).

---

## Code Examples

Verified patterns from official sources and existing codebase:

### Alpaca Trading WebSocket Connection

```typescript
// Source: https://docs.alpaca.markets/docs/websocket-streaming
// In tradingWs.ts
import WebSocket from 'ws';
import { config } from '../config';
import { getAlpacaBaseUrl } from './botController';

let tradingWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function startTradingWs() {
  if (!config.alpacaApiKey) {
    console.warn('[TradingWs] No API key — trading stream disabled');
    return;
  }
  connectTradingWs();
}

function connectTradingWs() {
  // Derive WS URL from REST base URL (mode-aware)
  const wsUrl = getAlpacaBaseUrl()
    .replace('https://', 'wss://')
    .replace('http://', 'ws://') + '/stream';

  tradingWs = new WebSocket(wsUrl);

  tradingWs.on('open', () => {
    tradingWs!.send(JSON.stringify({
      action: 'auth',
      key: config.alpacaApiKey,
      secret: config.alpacaApiSecret,
    }));
  });

  tradingWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleTradingWsMessage(msg);
    } catch { /* ignore parse errors */ }
  });

  tradingWs.on('close', () => {
    console.warn('[TradingWs] Disconnected — reconnecting in 5s');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectTradingWs, 5000);
  });

  tradingWs.on('error', (err) => console.error('[TradingWs] Error:', err.message));
}

function handleTradingWsMessage(msg: { stream: string; data: Record<string, unknown> }) {
  if (msg.stream === 'authorization') {
    const auth = msg.data as { status: string };
    if (auth.status === 'authorized') {
      tradingWs!.send(JSON.stringify({
        action: 'listen',
        data: { streams: ['trade_updates'] },
      }));
      console.log('[TradingWs] Authenticated — subscribed to trade_updates');
    }
    return;
  }

  if (msg.stream === 'trade_updates') {
    const update = msg.data as TradeUpdate;
    onTradeUpdate(update); // dispatch to tradeExecutor/positionMonitor handlers
  }
}
```

### Star-Rating Notional Amount Calculation

```typescript
// Source: CONTEXT.md + REQUIREMENTS.md (EXEC-07)
// In tradeExecutor.ts
type StarRating = 3 | 4 | 5;

function getStarRating(tier: number, aiConfidence: 'high' | 'medium' | 'low' | null): StarRating | null {
  // Tier 1-2: no AI eval needed, always high confidence
  if (tier <= 2) return 5;
  // Tier 3-4: determined by AI confidence
  if (aiConfidence === 'high') return 5;
  if (aiConfidence === 'medium') return 4;
  if (aiConfidence === 'low') return 3;
  // null = AI unavailable or declined — skip (CONTEXT.md: 1-2 star = skip)
  return null;
}

function getNotional(starRating: StarRating): number {
  const cfg = getBotConfig();
  if (starRating === 5) return cfg.tradeSizeStars5;  // $100 default
  if (starRating === 4) return cfg.tradeSizeStars4;  // $75 default
  return cfg.tradeSizeStars3;                        // $50 default
}
```

### Open Position Duplicate Check

```typescript
// Source: CONTEXT.md — "duplicate signals on same symbol while position open = SKIP"
// In tradeExecutor.ts — check BEFORE placing order
async function hasOpenPosition(symbol: string): Promise<boolean> {
  const count = await prisma.botTrade.count({
    where: { symbol, status: 'open' },
  });
  return count > 0;
}

// Usage:
if (await hasOpenPosition(symbol)) {
  console.log(`[TradeExecutor] SKIP ${symbol} — already have open position`);
  return; // silent skip, no DB write
}
```

### node-cron EOD Force-Close

```typescript
// Source: node-cron docs (verified via web search 2026)
import cron from 'node-cron';

// Called once from index.ts or positionMonitor init
export function scheduleEodForceClose() {
  cron.schedule('45 15 * * 1-5', async () => {
    console.log('[PositionMonitor] EOD force-close at 3:45 PM ET');
    const openTrades = await prisma.botTrade.findMany({ where: { status: 'open' } });
    for (const trade of openTrades) {
      if (openPositions.has(trade.id)) {
        const pos = openPositions.get(trade.id)!;
        await closePosition(pos, null, 'force_close_eod');
      }
    }
  }, { timezone: 'America/New_York' });
}
```

### Place Market Sell Order

```typescript
// Source: paperTrader.ts placeOrder() pattern — adapted for BotTrade
// In positionMonitor.ts
async function placeSell(symbol: string, qty: number): Promise<string> {
  const res = await fetch(`${getAlpacaBaseUrl()}/v2/orders`, {
    method: 'POST',
    headers: {
      'APCA-API-Key-ID': config.alpacaApiKey,
      'APCA-API-Secret-Key': config.alpacaApiSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      symbol,
      qty: String(qty),
      side: 'sell',
      type: 'market',
      time_in_force: 'day',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca sell failed (${res.status}): ${text}`);
  }
  const order = await res.json() as AlpacaOrderResponse;
  return order.id;
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Wait for fill by polling REST (paperTrader.ts `waitForFill()`) | Receive fill via trading WebSocket event (EXEC-02) | Real-time vs 2-second polling delay; WebSocket is Phase 3 requirement |
| Fixed share quantity (`qty: "10"`) | Dollar notional (`notional: 50`) | Fractional shares; consistent dollar risk regardless of share price |
| `paperTrader.ts` uses `PaperTrade` model | Phase 3 uses `BotTrade` model | BotTrade has `status`, `exitReason`, `catalystTier` for bot lifecycle |

**Note on existing `paperTrader.ts`:** This service remains in the codebase unchanged — it handles the "automatic paper trade" feature tied to the scanner. Phase 3's bot executor is parallel to it, not a replacement. Both can run simultaneously.

---

## Open Questions

1. **Should `tradingWs.ts` reconnect on mode switch?**
   - What we know: The trading WebSocket URL is mode-dependent. When `switchMode()` is called, the old WS connects to the wrong environment.
   - What's unclear: Should the trading WS restart automatically on mode change?
   - Recommendation: Yes — `switchMode()` should call `tradingWs.restart()`. This can be a simple disconnect+reconnect cycle.

2. **What happens to the position monitor loop when bot is paused?**
   - What we know: `getBotState()` returns `paused` when bot is paused. Signal engine already checks `getBotState() === 'running'`.
   - What's unclear: Should position monitor continue watching + exiting positions when bot is paused (e.g., user pauses but has open positions)?
   - Recommendation: YES — position monitor must continue watching even when paused. Pausing means "no new entries" not "abandon exits." Stop loss and EOD close should always run.

3. **Sell confirmation — polling vs WebSocket?**
   - What we know: Sell orders will also appear in `trade_updates` as fill events with `side: 'sell'`. But the existing `paperTrader.ts` uses polling for sell fills.
   - What's unclear: Do we need fill confirmation for sell orders, or is it sufficient to fire-and-forget the sell?
   - Recommendation: Fire-and-forget the sell order; update DB with the sell order ID immediately. The trading WebSocket will deliver the sell fill event, which can update `exitPrice`, `pnl`, and `status: 'closed'` in the BotTrade record.

4. **`maxHoldMinutes` in BotConfig vs existing `maxHoldDurationSec`**
   - What we know: BotConfig already has `maxHoldDurationSec` (in seconds). CONTEXT.md uses `maxHoldMinutes`. They are the same concept.
   - What's unclear: Should we add a new `maxHoldMinutes` field or reuse `maxHoldDurationSec`?
   - Recommendation: Reuse existing `maxHoldDurationSec` — same semantics, just convert to minutes at display time. Do NOT add a duplicate field.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` (no such key) — skipping this section per instructions.

---

## Sources

### Primary (HIGH confidence)
- https://docs.alpaca.markets/docs/websocket-streaming — Trading WebSocket URL, auth flow, subscribe message, all event types (fill, partial_fill, rejected, etc.), order object fields
- https://docs.alpaca.markets/reference/postorder — POST /v2/orders request schema; `notional` field; HTTP 200/403/422 response codes
- https://docs.alpaca.markets/docs/paper-trading — Paper vs live behavioral equivalence; paper URL `https://paper-api.alpaca.markets`
- Existing codebase (HIGH confidence): `paperTrader.ts`, `botController.ts`, `signalEngine.ts`, `alpaca.ts`, `schema.prisma`

### Secondary (MEDIUM confidence)
- Web search → https://docs.alpaca.markets/docs/websocket-streaming — Confirmed `trade_updates` event types and order object fields structure (verified against official docs URL)
- Web search (community verified) — Alpaca rate limit: 200 req/min, burst 10/sec — consistent across multiple forum sources
- Web search → node-cron docs — `cron.schedule('45 15 * * 1-5', fn, { timezone: 'America/New_York' })` — verified via nodecron.com

### Tertiary (LOW confidence)
- Community forum assertion that partial fills occur ~10% of the time in paper trading — single source, unverified against official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all patterns from official Alpaca docs and existing codebase
- Architecture: HIGH — mirrors proven paperTrader.ts patterns; Alpaca trading WebSocket well-documented
- Pitfalls: HIGH — BotConfig schema gap verified by reading schema.prisma; trading vs data WS URL confirmed by official docs; double-exit pattern observed in paperTrader.ts guard

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (Alpaca API is stable; 30-day window)
