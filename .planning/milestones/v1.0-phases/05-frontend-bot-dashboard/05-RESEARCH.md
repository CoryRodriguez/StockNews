# Phase 5: Frontend Bot Dashboard - Research

**Researched:** 2026-02-28
**Domain:** React + Zustand panel extension, WebSocket channel subscription, REST CRUD for bot config
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation decisions are delegated to Claude. Specific choices to make:

- **Panel structure**: Single `BotPanel` grid tile with internal tab navigation (Status/Positions | History | Signals | Config). Matches how users think of "the bot" as one thing. Add `"bot"` to `PanelType` union and `renderPanel()` in Dashboard.tsx.

- **Bot controls placement**: Pause, resume, and emergency stop buttons live inside the BotPanel header, next to the status badge. Consistent with ScannerPanel pattern (controls in header). Emergency stop is visually distinct (red).

- **Config editing UX**: Inline editable fields in the Config tab with a Save button. No modal. Simple key-value form for: catalyst tiers, position size USD, max concurrent positions, daily loss limit, minimum win rate %, hard stop %, max hold duration. Changes POST to `/api/bot/config` and persist in DB.

- **Signal rejection display**: Separate "Signals" tab within BotPanel showing last 100 rejected signals: ticker, catalyst type, timestamp, rejection reason. Newest at top. Does not auto-clear (scrollable log).

- **Open positions P&L**: Positions table subscribed to `quote_update` WebSocket messages (already handled by `watchlistStore`). Bot positions use the same price feed. Each row shows: ticker, entry price, current price, unrealized P&L ($), shares, catalyst type.

- **PDT counter**: Visible in Status tab header row — "PDT: 2/3 day trades used | 1 remaining (resets Thu)"

- **Completed bot trade history**: Uses same row pattern as existing `TradesPanel` (entry price, exit price, P&L, exit reason, catalyst type). Distinct from paper trades — shows only autonomous bot trades.

### Claude's Discretion
All implementation decisions are delegated to Claude (as above — user decided the structure and placement, but left code-level choices open).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | Dashboard includes a Bot Panel displaying current bot status (running, paused, stopped, market closed) | botStore.ts + WebSocket bot:status channel + GET /api/bot/status REST hydration on mount |
| UI-02 | Bot Panel displays all currently open positions with live P&L updating in real time | GET /api/bot/positions REST + quote_update WS feed (already in watchlistStore) + botStore positions slice |
| UI-03 | Bot Panel displays a log of recent bot trades (entry price, exit price, P&L, exit reason, catalyst type) | GET /api/bot/trades REST (BotTrade table, status != 'open') + WS bot:trade_closed push |
| UI-04 | Bot Panel provides pause, resume, and emergency stop controls | Existing POST /api/bot/pause, /api/bot/resume, /api/bot/stop routes (already built in Phase 1) |
| UI-05 | Bot Panel provides configuration UI for all bot thresholds | GET /api/bot/config + PATCH /api/bot/config → updateConfig() in botController (Phase 1 built updateConfig()) |
| UI-06 | Bot Panel displays current PDT day-trade counter and remaining day trades | BotDailyStats.dayTradeCount already persisted; expose via GET /api/bot/status extended response |
| UI-07 | Bot Panel displays signal rejection log with rejection reasons | GET /api/bot/signals REST (BotSignalLog table) + WS bot:signal_evaluated push |
</phase_requirements>

---

## Summary

Phase 5 is a pure frontend-plus-thin-backend extension. The bot state machine, trade execution, risk gates, and WebSocket broadcast infrastructure are all complete from Phases 1–4. This phase adds: (1) a `BotPanel` React component with four internal tabs, (2) a `botStore.ts` Zustand slice, (3) three new backend REST endpoints (`/api/bot/config`, `/api/bot/positions`, `/api/bot/trades`, `/api/bot/signals`), and (4) three new WebSocket channel handlers in `useSocket.ts` (`bot:status`, `bot:trade_closed`, `bot:signal_evaluated`).

The existing `clientHub.broadcast()` function already handles channel-based pushes. The existing `quote_update` WebSocket channel already delivers live prices to `watchlistStore.prices` — bot positions can read current prices from that same store for live P&L calculation. No new pricing infrastructure is needed.

The biggest design risk is state coherence: the Status tab must hydrate from REST on mount and then stay live via WebSocket — the same pattern already used by `TradesPanel` (REST on mount) and `ScannerPanel` (WebSocket alerts). Following this exact dual-fetch pattern eliminates race conditions.

**Primary recommendation:** Build BotPanel as a single component file with tab state managed locally via `useState`. Use `botStore.ts` for server-sourced data (status, positions, trades, signals, config). Hydrate via REST on mount; update via WebSocket. Reuse TradesPanel row pattern for history; reuse watchlistStore price data for live P&L.

---

## Standard Stack

### Core (already in project — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.2.0 | Component rendering | Project stack |
| Zustand | 4.5.2 | Client state management | Existing pattern (tradesStore, scannerStore, etc.) |
| Tailwind CSS | 3.4.1 | Styling with dark-theme tokens | Existing design system |
| TypeScript | 5.3.3 | Type safety | Existing project language |
| Express + existing routes | — | REST endpoints | Backend already wired |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Prisma | existing | DB access for BotTrade, BotSignalLog, BotDailyStats | All three new REST endpoints query these models |
| clientHub.broadcast() | — | WS channel push from backend | Bot state changes, new trade closes, signal evaluations |
| watchlistStore.prices | — | Current ticker prices | Live P&L calculation for open positions |
| useAuthStore | — | JWT token for API calls | Every fetch call in BotPanel useEffect |

### No New Dependencies

No new npm packages are needed. The entire phase is assembled from existing libraries and patterns.

**Installation:**
```bash
# No new packages — all existing
```

---

## Architecture Patterns

### Recommended File Structure

```
frontend/src/
├── components/panels/
│   └── BotPanel.tsx          # New — single file, 4 tabs internally
├── store/
│   └── botStore.ts           # New — Zustand slice for bot state
└── types/index.ts            # Modified — add "bot" to PanelType, new bot types

backend/src/
└── routes/
    └── bot.ts                # Modified — add /config GET+PATCH, /positions, /trades, /signals
```

### Pattern 1: Tab State via Local useState (not store)

**What:** BotPanel keeps active tab in local component state with `useState<"status" | "history" | "signals" | "config">("status")`. Tab selection is pure UI — no reason to persist or share it.

**When to use:** Any UX state that is component-local and not needed by other components.

```typescript
// BotPanel.tsx pattern
type BotTab = "status" | "history" | "signals" | "config";

export function BotPanel() {
  const [tab, setTab] = useState<BotTab>("status");
  // ...
  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      {/* Header with status badge + controls */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-panel shrink-0">
        <div className="flex items-center gap-2">
          <StatusBadge state={status.state} marketOpen={status.marketOpen} />
          <span className="text-white text-xs font-semibold">Bot</span>
        </div>
        <BotControls state={status.state} />
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {(["status", "history", "signals", "config"] as BotTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-[10px] font-mono capitalize ${
              tab === t ? "text-accent border-b-2 border-accent" : "text-muted hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "status"  && <StatusTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "signals" && <SignalsTab />}
        {tab === "config"  && <ConfigTab />}
      </div>
    </div>
  );
}
```

### Pattern 2: botStore.ts — Zustand Slice Shape

**What:** A single Zustand store slice holding all server-sourced bot data. Follows the same `create<State>((set) => ...)` pattern used by tradesStore and scannerStore.

**When to use:** Any data that comes from the server and must be shared across BotPanel's sub-tabs.

```typescript
// frontend/src/store/botStore.ts
import { create } from "zustand";

export interface BotStatus {
  state: "stopped" | "running" | "paused";
  mode: "paper" | "live";
  openPositionCount: number;
  todayRealizedPnl: number;
  todayTradeCount: number;
  dayTradeCount: number;
  marketOpen: boolean;
}

export interface BotPosition {
  tradeId: string;
  symbol: string;
  entryPrice: number;
  shares: number;
  catalystType: string;
}

export interface BotTrade {
  id: string;
  symbol: string;
  entryPrice: number | null;
  exitPrice: number | null;
  shares: number | null;
  pnl: number | null;
  catalystType: string | null;
  exitReason: string | null;
  entryAt: string | null;
  exitAt: string | null;
}

export interface BotSignal {
  id: string;
  symbol: string;
  catalystCategory: string | null;
  catalystTier: number | null;
  rejectReason: string | null;
  evaluatedAt: string;
}

export interface BotConfig {
  enabledCatalystTiers: string;
  positionSizeUsd: number;
  confidenceMultiplierHigh: number;
  confidenceMultiplierMed: number;
  confidenceMultiplierLow: number;
  maxConcurrentPositions: number;
  dailyLossLimitUsd: number;
  minWinRate: number;
  hardStopLossPct: number;
  maxHoldDurationSec: number;
  maxFloatShares: number;
  maxSharePrice: number;
  minRelativeVolume: number;
  tradeSizeStars3: number;
  tradeSizeStars4: number;
  tradeSizeStars5: number;
  profitTargetPct: number;
  trailingStopPct: number;
  trailingStopDollar: number;
}

interface BotState {
  status: BotStatus | null;
  positions: BotPosition[];
  trades: BotTrade[];
  signals: BotSignal[];
  config: BotConfig | null;

  setStatus: (s: BotStatus) => void;
  setPositions: (p: BotPosition[]) => void;
  prependTrade: (t: BotTrade) => void;
  setTrades: (t: BotTrade[]) => void;
  prependSignal: (s: BotSignal) => void;
  setSignals: (s: BotSignal[]) => void;
  setConfig: (c: BotConfig) => void;
}

export const useBotStore = create<BotState>((set) => ({
  status: null,
  positions: [],
  trades: [],
  signals: [],
  config: null,

  setStatus: (status) => set({ status }),
  setPositions: (positions) => set({ positions }),
  prependTrade: (t) => set((s) => ({ trades: [t, ...s.trades].slice(0, 100) })),
  setTrades: (trades) => set({ trades }),
  prependSignal: (sig) => set((s) => ({ signals: [sig, ...s.signals].slice(0, 100) })),
  setSignals: (signals) => set({ signals }),
  setConfig: (config) => set({ config }),
}));
```

### Pattern 3: REST Hydration on Mount + WebSocket for Live Updates

**What:** On BotPanel mount, fire all REST endpoints simultaneously via `Promise.all`. Then WebSocket messages keep state current. This is the same pattern TradesPanel uses for REST and ScannerPanel uses for WebSocket.

```typescript
// BotPanel.tsx — data loading pattern
useEffect(() => {
  if (!token) return;
  const headers = { Authorization: `Bearer ${token}` };
  Promise.all([
    fetch("/api/bot/status",    { headers }).then(r => r.json()),
    fetch("/api/bot/positions", { headers }).then(r => r.json()),
    fetch("/api/bot/trades",    { headers }).then(r => r.json()),
    fetch("/api/bot/signals",   { headers }).then(r => r.json()),
    fetch("/api/bot/config",    { headers }).then(r => r.json()),
  ]).then(([status, positions, trades, signals, config]) => {
    setStatus(status);
    setPositions(positions);
    setTrades(trades);
    setSignals(signals);
    setConfig(config);
  }).catch(() => {});
}, [token]);
```

### Pattern 4: Live P&L from watchlistStore Prices

**What:** Bot open positions read `currentPrice` from `watchlistStore.prices[symbol]` (already populated by the `quote_update` WebSocket channel). No separate price subscription needed — the existing infrastructure handles it.

**Critical:** Bot position tickers must be in the watchlist for price updates to arrive. The backend will need to subscribe the Alpaca WebSocket to bot position symbols when they are opened (or positions endpoint can trigger a frontend subscription). Simplest approach: frontend subscribes `quotes:{symbol}` channel on mount whenever positions load.

```typescript
// In useSocket.ts — extend subscribeChannels with bot position tickers
// botStore.positions → subscribe "quotes:{symbol}" for each
```

### Pattern 5: Bot Control Buttons — Optimistic UI Pattern

**What:** Pause/Resume/Stop buttons call POST endpoint, then refresh status from the response. No separate status poll needed — response contains `{ state: "paused" }`.

```typescript
async function handlePause() {
  const res = await fetch("/api/bot/pause", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (res.ok) {
    setStatus({ ...status!, state: data.state });
  }
}
```

### Pattern 6: Config Form — Controlled Inputs with Local Draft State

**What:** Config tab maintains a `draft` object in local `useState` mirroring `BotConfig`. User edits draft fields. "Save" button submits PATCH. On success, update botStore.

```typescript
const [draft, setDraft] = useState<BotConfig | null>(null);
// Initialize draft from botStore.config when it loads
useEffect(() => { if (config) setDraft(config); }, [config]);

async function handleSave() {
  const res = await fetch("/api/bot/config", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(draft),
  });
  if (res.ok) {
    const updated = await res.json();
    setConfig(updated);
  }
}
```

### Pattern 7: New WsMessage Types in types/index.ts

**What:** Extend `WsMessage` union with bot-specific message types for the three new WebSocket channels.

```typescript
// types/index.ts additions
| { type: "bot_status_update"; channel: string; status: BotStatus }
| { type: "bot_trade_closed"; channel: string; trade: BotTrade }
| { type: "bot_signal_evaluated"; channel: string; signal: BotSignal }
```

### Pattern 8: useSocket.ts — Add Bot Channel Subscriptions

**What:** Extend `subscribeChannels()` in useSocket.ts to subscribe `bot` channel, and add handlers in `handleMessage` for the three new message types.

```typescript
// In subscribeChannels:
"bot",  // add to channels array

// In handleMessage:
} else if (msg.type === "bot_status_update") {
  setBotStatus(msg.status);
} else if (msg.type === "bot_trade_closed") {
  prependBotTrade(msg.trade);
} else if (msg.type === "bot_signal_evaluated") {
  prependBotSignal(msg.signal);
}
```

### Pattern 9: Backend WebSocket Broadcasts — Where to Wire Them

**What:** The backend must call `broadcast("bot", { type, ... })` at three points:

1. **Bot state changes** — in `setBotState()` in botController.ts — after persisting new state
2. **Trade closes** — in `closePosition()` in positionMonitor.ts — after BotTrade update
3. **Signal evaluations** — in `writeSignalLog()` or at the end of `evaluateBotSignal()` in signalEngine.ts — for rejected signals only (outcome === "rejected")

```typescript
// botController.ts: setBotState addition
import { broadcast } from '../ws/clientHub';
// After DB persist:
broadcast("bot", { type: "bot_status_update", status: { state: newState, ... } });

// positionMonitor.ts: closePosition addition
broadcast("bot", { type: "bot_trade_closed", trade: { id, symbol, exitPrice, pnl, exitReason, ... } });

// signalEngine.ts: after BotSignalLog write for rejected outcome
broadcast("bot", { type: "bot_signal_evaluated", signal: { id, symbol, catalystCategory, rejectReason, evaluatedAt } });
```

### Pattern 10: New Backend REST Endpoints

**What:** Three new routes added to `backend/src/routes/bot.ts`. One existing route (`GET /status`) needs extension to include `dayTradeCount`.

```typescript
// GET /api/bot/config — returns current BotConfig
router.get('/config', requireAuth, async (_req, res) => {
  const cfg = getBotConfig();
  res.json(cfg);
});

// PATCH /api/bot/config — applies partial update, persists to DB
router.patch('/config', requireAuth, async (req, res) => {
  try {
    const updated = await updateConfig(req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// GET /api/bot/positions — open bot trades
router.get('/positions', requireAuth, async (_req, res) => {
  const positions = await prisma.botTrade.findMany({
    where: { status: 'open' },
    orderBy: { entryAt: 'desc' },
  });
  res.json(positions);
});

// GET /api/bot/trades — completed bot trades (last 100)
router.get('/trades', requireAuth, async (_req, res) => {
  const trades = await prisma.botTrade.findMany({
    where: { status: { not: 'open' } },
    orderBy: { exitAt: 'desc' },
    take: 100,
  });
  res.json(trades);
});

// GET /api/bot/signals — last 100 rejected signals
router.get('/signals', requireAuth, async (_req, res) => {
  const signals = await prisma.botSignalLog.findMany({
    where: { outcome: 'rejected' },
    orderBy: { evaluatedAt: 'desc' },
    take: 100,
    select: {
      id: true, symbol: true, catalystCategory: true, catalystTier: true,
      rejectReason: true, evaluatedAt: true, headline: true, source: true,
    },
  });
  res.json(signals);
});
```

**GET /status extension for PDT counter:**
```typescript
// Add dayTradeCount to existing /status response:
const [openPositionCount, dailyStats] = await Promise.all([
  prisma.botTrade.count({ where: { status: 'open' } }),
  prisma.botDailyStats.findFirst({ where: { date: todayET } }),
]);
res.json({
  state: getBotState(),
  mode: cfg.mode,
  openPositionCount,
  todayRealizedPnl: dailyStats?.realizedPnl ?? 0,
  todayTradeCount: dailyStats?.tradeCount ?? 0,
  dayTradeCount: dailyStats?.dayTradeCount ?? 0,   // ADD THIS
  marketOpen: isMarketOpen(),
});
```

### Anti-Patterns to Avoid

- **Polling for bot status:** Do NOT use `setInterval` to poll `/api/bot/status`. Use the `bot:status_update` WebSocket push instead. Polling adds latency and unnecessary DB queries.
- **Separate price subscription for positions:** Do NOT create a new WebSocket subscription for bot position prices. Re-use `watchlistStore.prices` which already receives `quote_update` messages.
- **Creating botStore state for tab selection:** Tab is local UI state, not shared data. Keep it in local `useState`.
- **Rebuilding the entire status object on every WS message:** The `bot_status_update` message should carry the full status snapshot (not diffs) to avoid staleness from partial updates.
- **Modal for config editing:** User locked this to inline fields with Save button. No modal.
- **Showing "fired" signals in the Signals tab:** Tab shows only rejected signals (outcome === "rejected"). Fired signals appear in trade history.
- **String inputs for numeric config fields:** Use `type="number"` inputs. Parse with `parseFloat` before PATCH. Validate non-negative on Save.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Live price feed for positions | Custom Alpaca WS subscription in BotPanel | `watchlistStore.prices[symbol]` (already populated by quote_update) | The WS infrastructure is already wired in useSocket.ts |
| Bot state broadcast | Custom SSE or long-poll | `clientHub.broadcast("bot", ...)` | Already handles auth, subscriptions, reconnect |
| Tab UI library | Install a tab component library | Local `useState` + simple button row | Overkill; existing panels use the same inline pattern |
| Config validation library | Zod/yup for form validation | Simple JS guards before PATCH (check `>= 0`, within range) | Single config form; heavy validation library is not worth it |
| Real-time P&L calculation service | Separate polling loop | `(currentPrice - entryPrice) * shares` inline in render | Position monitor already does this server-side; frontend can compute it client-side from price feed |

**Key insight:** Almost everything needed is already built. This phase is wiring + UI, not new infrastructure.

---

## Common Pitfalls

### Pitfall 1: Bot Position Tickers Not Subscribed to quote_update

**What goes wrong:** Bot open positions display as "—" for current price and P&L because the tickers aren't in the watchlist, so no `quote_update` messages arrive for them.

**Why it happens:** The `quote_update` WebSocket feed only delivers prices for tickers that have been subscribed via `scanner:*` or direct quote subscription. Bot tickers are not necessarily in the user's watchlist.

**How to avoid:** When BotPanel mounts and positions load, subscribe each position ticker to the `quotes:{symbol}` channel:
```typescript
// After positions load in useEffect:
for (const pos of positions) {
  ws.send(JSON.stringify({ type: "subscribe", channel: `quotes:${pos.symbol}` }));
}
```
The backend scanner.ts already handles `quotes:{symbol}` channel subscriptions for snapshot updates.

**Warning signs:** Open positions show static prices that never change.

### Pitfall 2: Config PATCH Sends Entire BotConfigRecord Including `id` and `updatedAt`

**What goes wrong:** The PATCH endpoint receives `id: "singleton"` and `updatedAt: "..."` in the body and either errors or Prisma complains about updating immutable fields.

**Why it happens:** The frontend sends `JSON.stringify(config)` which includes all fields from the GET response.

**How to avoid:** The backend `updateConfig()` in botController.ts already uses `Partial<Omit<BotConfigRecord, 'id' | 'updatedAt'>>`. The route should strip `id` and `updatedAt` from `req.body` before passing to `updateConfig()`:
```typescript
const { id: _id, updatedAt: _ts, ...patch } = req.body;
const updated = await updateConfig(patch);
```

**Warning signs:** PATCH returns 500; Prisma error about read-only field.

### Pitfall 3: WebSocket Bot Channel Not Subscribed After Reconnect

**What goes wrong:** Browser reconnects WebSocket (e.g., after wake-from-sleep). Bot status goes stale because the `"bot"` channel is not re-subscribed after reconnect.

**Why it happens:** `useSocket.ts` tracks subscriptions in `subscribedRef` which persists across reconnects, but the server-side channel set is cleared when the connection closes. After reconnect, the `"connected"` message triggers `subscribeChannels()` which skips already-tracked channels.

**How to avoid:** Clear `subscribedRef.current` when the WebSocket closes (before reconnect), not after. Review the existing `onclose` handler — it does `globalWs = null` but `subscribedRef` in `useSocket.ts` is a `useRef` that persists. Solution: clear `subscribedRef.current` in the `onclose` callback or when handling the `"connected"` message:
```typescript
// In handleMessage, when type === "connected":
subscribedRef.current.clear(); // reset so subscribeChannels re-sends all
subscribeChannels(ws);
```
Note: Check current useSocket.ts — the `"connected"` handler already calls `subscribeChannels(ws)` but does NOT clear the ref first. This is an existing bug that affects all channels. Phase 5 surfaces it because bot channels are newly added.

**Warning signs:** Bot status freezes after browser reconnect; other WS data (scanner, news) also stops updating after reconnect.

### Pitfall 4: PDT Reset Day Calculation

**What goes wrong:** "Resets Thu" display is wrong — PDT window is a rolling 5-business-day window, not a fixed weekly cycle.

**Why it happens:** Calculating the correct reset date requires knowing which day the 5-day window started, which is tracked by Alpaca, not by the local BotDailyStats table.

**How to avoid:** For the Phase 5 display, show only the count ("2/3 used") and skip the reset-day calculation entirely, or derive it from the current day of week:
```typescript
// Simple approximation — next Mon if Fri, else next business day
function pdtResetDay(): string {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun...6=Sat
  const daysUntilReset = day === 5 ? 3 : day === 6 ? 2 : 1; // Fri→Mon, Sat→Mon, else tomorrow
  const reset = new Date(et);
  reset.setDate(et.getDate() + daysUntilReset);
  return reset.toLocaleDateString('en-US', { weekday: 'short' });
}
```
This approximation is acceptable for display. The actual enforcement is done server-side by the Alpaca API call in checkPdtLimit().

**Warning signs:** "Resets" shows wrong day.

### Pitfall 5: Config Form Allows Invalid State During Editing

**What goes wrong:** User types "0" into `positionSizeUsd` mid-edit, triggering immediate validation errors or saving an invalid value.

**Why it happens:** If the PATCH fires on every keystroke (onChange), partial values are sent to the server.

**How to avoid:** Use a local `draft` state and only fire PATCH on explicit "Save" button click. Validate before PATCH:
```typescript
if (draft.positionSizeUsd <= 0) return alert("Position size must be > 0");
if (draft.minWinRate < 0 || draft.minWinRate > 1) return alert("Win rate must be 0–1");
```

**Warning signs:** Bot config resets to 0 mid-edit; server rejects with 400.

### Pitfall 6: BotPanel Not Appearing in Dashboard After `PanelType` Addition

**What goes wrong:** Adding `"bot"` to `PanelType` but not updating `DEFAULT_PANELS` in `dashboardStore.ts` means the user never sees the panel unless they manually add it to layout.

**Why it happens:** Dashboard renders only panels in the `panels` array. New panel types require a default entry.

**How to avoid:** Add a default BotPanel entry to `DEFAULT_PANELS` in `dashboardStore.ts`. Use `x:0, y:28` to place it below existing panels, or use a reasonable grid position. Users can drag/resize via react-grid-layout.

**Warning signs:** "Bot" option in panel type union but no panel visible on dashboard.

---

## Code Examples

### PDT Counter Display (Status Tab)

```typescript
// Source: CONTEXT.md decision
function PdtCounter({ dayTradeCount }: { dayTradeCount: number }) {
  const used = Math.min(dayTradeCount, 3);
  const remaining = Math.max(0, 3 - used);
  const resetDay = pdtResetDay();
  return (
    <div className="text-xs font-mono text-muted">
      PDT:{" "}
      <span className={used >= 3 ? "text-down" : "text-yellow-400"}>
        {used}/3 day trades used
      </span>
      {" | "}
      <span className={remaining === 0 ? "text-down font-semibold" : "text-up"}>
        {remaining} remaining
      </span>
      <span className="text-muted"> (resets {resetDay})</span>
    </div>
  );
}
```

### Status Badge Component

```typescript
// Maps bot state + market hours to display color
const STATE_COLORS: Record<string, string> = {
  running:       "bg-up text-black",
  paused:        "bg-yellow-400 text-black",
  stopped:       "bg-down text-white",
  market_closed: "bg-surface text-muted border border-border",
};

function StatusBadge({ state, marketOpen }: { state: string; marketOpen: boolean }) {
  const displayState = !marketOpen && state === "running" ? "market_closed" : state;
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${STATE_COLORS[displayState] ?? "bg-surface text-muted"}`}>
      {displayState.replace("_", " ")}
    </span>
  );
}
```

### Open Position Row (live P&L from watchlistStore)

```typescript
function PositionRow({ pos }: { pos: BotPosition }) {
  const currentPrice = useWatchlistStore((s) => s.prices[pos.symbol]?.price ?? pos.entryPrice);
  const unrealizedPnl = (currentPrice - pos.entryPrice) * pos.shares;
  const pnlPositive = unrealizedPnl >= 0;
  return (
    <div className="px-2 py-1.5 border-b border-border text-xs font-mono hover:bg-surface">
      <div className="flex items-center justify-between">
        <span className="text-white font-semibold">{pos.symbol}</span>
        <span className={`font-semibold ${pnlPositive ? "text-up" : "text-down"}`}>
          {pnlPositive ? "+" : ""}${unrealizedPnl.toFixed(2)}
        </span>
      </div>
      <div className="flex gap-3 mt-0.5 text-muted text-[10px]">
        <span>Entry: ${pos.entryPrice.toFixed(2)}</span>
        <span>Now: ${currentPrice.toFixed(2)}</span>
        <span>{pos.shares} sh</span>
        <span>{pos.catalystType}</span>
      </div>
    </div>
  );
}
```

### Bot Trade History Row (reusing TradesPanel pattern)

```typescript
function BotTradeRow({ trade }: { trade: BotTrade }) {
  const pnl = trade.pnl ?? 0;
  const pnlPositive = pnl >= 0;
  return (
    <div className="px-2 py-1.5 border-b border-border text-xs font-mono hover:bg-surface">
      <div className="flex items-center justify-between">
        <span className="text-white font-semibold">{trade.symbol}</span>
        {trade.pnl != null && (
          <span className={`font-semibold ${pnlPositive ? "text-up" : "text-down"}`}>
            {pnlPositive ? "+" : ""}${pnl.toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex gap-3 mt-0.5 text-muted text-[10px]">
        <span>In: {trade.entryPrice != null ? `$${trade.entryPrice.toFixed(2)}` : "—"}</span>
        <span>Out: {trade.exitPrice != null ? `$${trade.exitPrice.toFixed(2)}` : "—"}</span>
        <span className="text-yellow-400">{trade.exitReason ?? "—"}</span>
        <span>{trade.catalystType ?? "—"}</span>
      </div>
    </div>
  );
}
```

### Signal Rejection Row

```typescript
const REJECT_LABELS: Record<string, string> = {
  "stale":              "Stale news",
  "duplicate":          "Duplicate",
  "market-closed":      "Mkt closed",
  "opening-auction":    "Opening auction",
  "tier-disabled":      "Tier off",
  "below-win-rate":     "Low win rate",
  "failed-5-pillars":   "5 Pillars fail",
  "ai-declined":        "AI declined",
  "ai-timeout":         "AI timeout",
  "ai-unavailable":     "AI unavailable",
  "reconnect-cooldown": "Reconnect cool",
  "danger-pattern":     "Danger pattern",
};

function SignalRow({ signal }: { signal: BotSignal }) {
  const label = signal.rejectReason ? (REJECT_LABELS[signal.rejectReason] ?? signal.rejectReason) : "rejected";
  return (
    <div className="px-2 py-1.5 border-b border-border text-xs font-mono hover:bg-surface">
      <div className="flex items-center justify-between">
        <span className="text-white font-semibold">{signal.symbol}</span>
        <span className="text-down text-[10px]">{label}</span>
      </div>
      <div className="flex gap-3 mt-0.5 text-muted text-[10px]">
        <span>{signal.catalystCategory ?? "—"}</span>
        <span>{new Date(signal.evaluatedAt).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
```

### Emergency Stop Button Style

```typescript
// Per CONTEXT.md: "Emergency stop is visually distinct (red)"
<button
  onClick={handleStop}
  className="text-[10px] px-2 py-0.5 rounded border border-red-600/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-mono"
>
  STOP
</button>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling REST for live state | WebSocket channel subscription | Already in project | Bot status stays live without polling overhead |
| Per-component price fetch | Shared watchlistStore.prices | Already in project | Zero-cost live P&L for positions using existing feed |
| REST-only dashboard | REST hydration + WS updates | Already in project | Mount hydration + live updates is the established pattern |

**No deprecated patterns in scope.** The project's React 18 + Zustand 4 + TypeScript stack is current and stable. react-grid-layout 1.4.4 is used for the dashboard container — BotPanel integrates as another panel in the existing grid.

---

## Open Questions

1. **Bot position tickers and quote_update subscription scope**
   - What we know: `quote_update` messages arrive for scanner tickers and watchlist tickers that the backend Alpaca WS is tracking.
   - What's unclear: Does the backend automatically subscribe to price updates for bot position symbols when a trade is opened? If not, the frontend must trigger a `quotes:{symbol}` subscription when it learns of a new position.
   - Recommendation: In the backend `tradeExecutor.ts`, call `broadcast("bot", { type: "bot_position_opened", symbol })` after fill confirmation, and have the frontend subscribe `quotes:{symbol}` when it receives this message. Alternatively: the backend scanner.ts can subscribe Alpaca WS to bot position symbols when they open. The cleanest solution is frontend-driven: subscribe `quotes:{symbol}` for each position when positions load from REST.

2. **Config PATCH validation — server or client side**
   - What we know: `updateConfig()` in botController accepts `Partial<Omit<BotConfigRecord, 'id' | 'updatedAt'>>` with no validation.
   - What's unclear: Should the PATCH route validate field ranges (e.g., `minWinRate` must be 0.0–1.0)?
   - Recommendation: Add lightweight validation in the route handler before calling `updateConfig()`. Reject with 400 if values are out of range. This prevents corrupted config from a bad UI submission.

3. **SIG-07 pending status — BotSignalLog `evaluateBotSignal` completeness**
   - What we know: SIG-07 ("bot logs every evaluated signal") is marked "Pending" in REQUIREMENTS.md traceability. The BotSignalLog writes exist in signalEngine.ts but the Phase 2 verification showed the signal log was incomplete.
   - What's unclear: Are all rejection paths actually writing to BotSignalLog, or are some paths writing "skipped" (silent) instead of "rejected"? The Signals tab (UI-07) only shows `outcome === "rejected"`.
   - Recommendation: Before building the Signals tab UI, verify `prisma.botSignalLog.findMany({ where: { outcome: 'rejected' }, take: 10 })` returns data on a running instance. If the log is empty, investigate which rejection paths write "skipped" vs "rejected".

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `frontend/src/store/tradesStore.ts` — Zustand slice pattern verified
- Direct code inspection of `frontend/src/store/scannerStore.ts` — channel subscription pattern verified
- Direct code inspection of `frontend/src/hooks/useSocket.ts` — WebSocket subscribe/message pattern verified
- Direct code inspection of `frontend/src/pages/Dashboard.tsx` — PanelType and renderPanel() verified
- Direct code inspection of `frontend/src/types/index.ts` — PanelType union, WsMessage union verified
- Direct code inspection of `backend/src/routes/bot.ts` — existing endpoints (start/pause/resume/stop/status) verified
- Direct code inspection of `backend/src/services/botController.ts` — updateConfig() function verified (already built in Phase 1)
- Direct code inspection of `backend/src/ws/clientHub.ts` — broadcast(channel, payload) API verified
- Direct code inspection of `backend/prisma/schema.prisma` — BotTrade, BotConfig, BotDailyStats, BotSignalLog models verified
- Direct code inspection of `frontend/src/components/panels/TradesPanel.tsx` — row component pattern verified
- Direct code inspection of `frontend/src/components/panels/ScannerPanel.tsx` — header with controls pattern verified
- Direct code inspection of `frontend/src/store/watchlistStore.ts` — prices map, updatePrice() verified
- Direct code inspection of `frontend/tailwind.config.js` — design tokens verified (surface, panel, border, up, down, accent, muted)

### Secondary (MEDIUM confidence)
- CONTEXT.md — locked decisions for panel structure, tab layout, config UX, PDT display format
- STATE.md — architecture notes confirming "all bot state broadcast via existing clientHub.ts infrastructure"
- REQUIREMENTS.md — UI-01 through UI-07 behavioral requirements

### Tertiary (LOW confidence)
- None — all findings are grounded in code inspection or project documents.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — inspected actual package.json, all libraries confirmed present
- Architecture patterns: HIGH — derived from direct code reading of existing panels and stores
- Pitfalls: HIGH — pitfalls identified from code inspection (subscribedRef clear bug, config PATCH field stripping)
- Backend endpoints: HIGH — updateConfig() already built; route stubs straightforward
- WebSocket broadcast wiring: HIGH — clientHub.broadcast() API confirmed

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stable stack; only risk is if bot service files change before Phase 5 execution)
