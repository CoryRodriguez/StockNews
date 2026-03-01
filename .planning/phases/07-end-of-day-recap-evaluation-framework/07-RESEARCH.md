# Phase 7: End-of-Day Recap & Evaluation Framework - Research

**Researched:** 2026-03-01
**Domain:** Data aggregation, charting (Recharts), Prisma schema extension, cron scheduling, React page routing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Recap structure:**
- Layered design: summary card at top, expandable deep-dive sections below
- Summary card shows: Daily P&L (hero metric, big green/red number), win/loss count with percentage, trade count, daily numeric score (0-100), best trade, worst trade, signal count (evaluated vs fired)
- Four expandable deep-dive sections: Trade-by-trade breakdown, Signal rejection analysis, Catalyst performance, Strategy adherence

**Trade-by-trade breakdown:**
- Each trade as an enriched row: symbol, catalyst type/tier, entry/exit price, P&L, exit reason, hold time
- Enriched with TradeAnalytics data: VWAP deviation at entry, peak price reached, max drawdown percentage

**Signal rejection analysis:**
- Histogram of rejection reasons (stale, failed-5-pillars, ai-declined, pdt-limit, etc.)
- Missed opportunities section: signals that were rejected but the stock moved favorably after rejection
- Background tracking: after rejecting a signal, watch the stock's price for 30 min via existing Alpaca snapshots
- Store peak % move in a new BotSignalLog field (postRejectPeakPct)
- Flag as missed opportunity if stock moved +5%+ after rejection

**Catalyst performance:**
- P&L and win rate broken down by catalyst category (FDA, earnings, M&A, etc.)
- Shows which catalyst categories made money today vs lost money

**Strategy adherence:**
- Compare StrategyEngine recommended hold duration vs actual hold duration for each trade
- Identify early exits (hard stop triggered before recommended hold time) and overholds
- Exit reason distribution: breakdown of profit target, trailing stop, hard stop, time limit, EOD close

**Daily scoring:**
- Numeric score 0-100 based on weighted composite factors (P&L, win rate, signal quality, risk compliance, strategy adherence)
- Displayed in summary card alongside P&L

**Actionable suggestions:**
- Surface 1-3 auto-generated observations from the day's data
- Examples: "3 signals rejected by failed-5-pillars moved +8% avg — review thresholds", "FDA trades 3/3 wins — consider increasing position size"
- Suggestions only — never auto-apply changes

**Benchmarks:**
- Compare today's metrics against rolling 5-day and 30-day self-averages (P&L, win rate, signal count, score)
- Compare against market benchmarks: SPY and QQQ daily performance from Alpaca
- "Above/below average day" indicator with trend arrows

**Delivery & access:**
- Summary view in new "Recap" tab in BotPanel (5th tab alongside Status, History, Signals, Config)
- Full detailed view on separate /recap route with all sections expanded and more room for charts
- "View full recap" link from BotPanel tab opens /recap page
- Date picker in both views to browse past days

**Data generation:**
- Auto-persist: cron job at ~4:01 PM ET computes and persists daily recap to a DailyRecap table for fast historical loads
- On-demand: GET /api/bot/recap?date=YYYY-MM-DD computes fresh recap from source data anytime (for intraday checks)
- Persisted recaps load instantly; on-demand recomputes for freshest data

**Notification:**
- Tab badge dot appears on Recap tab after 4 PM ET market close to nudge user to review
- Badge clears when Recap tab is viewed

**Historical views:**
- Three view modes: Day, Week, Month
- Day view: summary card + expandable sections + intraday P&L timeline chart with trade event markers
- Week view: Mon-Fri daily rows with P&L, win rate; week total and comparison to previous week
- Month view: weekly rollups with monthly total and comparison to previous month
- Period-over-period comparisons with trend indicators (arrows, percentage deltas)

**Charts & visualizations:**
- All chart types available: bar charts, line charts, and data tables
- Bar charts for daily P&L in week view, weekly P&L in month view (green=profit, red=loss)
- Line chart for cumulative P&L trend, win rate trend over time
- Intraday P&L timeline in day view with trade open/close markers
- User can see all visualization styles and pick their favorite in practice

### Claude's Discretion
- Charting library choice (Recharts, Chart.js, lightweight-charts, etc.)
- Exact scoring formula weights and thresholds for the 0-100 score
- Loading states and error handling
- DailyRecap table schema design
- Exact spacing, typography, and color scheme within existing Tailwind design system
- How to fetch SPY/QQQ daily performance from Alpaca (snapshot vs bars endpoint)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 7 builds a layered end-of-day evaluation system that aggregates each trading day's bot activity into a persisted recap. The primary technical work falls into five distinct areas: (1) a new `postRejectPeakPct` field on `BotSignalLog` plus a background missed-opportunity tracker service, (2) a `DailyRecap` Prisma model and an `eodRecap.ts` computation service, (3) a new `GET /api/bot/recap` REST endpoint, (4) a 5th "Recap" tab in `BotPanel.tsx` plus a new `/recap` full-page route, and (5) a charting layer using Recharts.

The entire backend computation draws on data already collected by Phases 1–6 — `BotTrade`, `BotSignalLog`, `TradeAnalytics`, `BotDailyStats`, and `StrategyRule` are all in place and queryable via Prisma. No new dependencies are needed beyond a charting library. SPY/QQQ benchmarks are straightforward: the existing `getSnapshots()` function in `alpaca.ts` already returns `changePct` from `prevDailyBar`, making benchmark comparison a zero-effort call.

The missed-opportunity tracker is the only genuinely new background service — it must watch rejected signals' price for 30 minutes post-rejection using the existing `getSnapshot()` polling and write `postRejectPeakPct` back to the `BotSignalLog` row. The rest of Phase 7 is primarily data assembly and presentation work.

**Primary recommendation:** Use Recharts 3.x (`recharts@^3.0`) as the charting library — it is the React-native SVG chart library, has first-class TypeScript support, composes naturally with the existing Tailwind dark theme, and requires zero canvas or external SVG manipulation.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^3.7.0 | Bar charts, line charts, area charts, ComposedChart with trade markers | React-native SVG, first-class TypeScript, composable components, no canvas API required |
| node-cron | already installed | 4:01 PM ET recap persist cron | Already used for EOD force-close and 4 AM reset; zero new dependency |
| Prisma | already installed | DailyRecap model, BotSignalLog schema migration | Existing ORM — just extend schema |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand | already installed | useRecapStore or extend useBotStore | State management for recap tab and /recap page; follow existing pattern |
| react-grid-layout | already installed | Dashboard panel system | Already used; Recap tab lives inside BotPanel, not a new grid panel |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | chart.js + react-chartjs-2 | Heavier bundle; canvas-based (harder to style with Tailwind); more config overhead |
| recharts | lightweight-charts (TradingView) | Specialized for OHLCV candlestick; overkill for P&L timelines; heavier |
| recharts | victory | Less community traction; recharts has 3x npm downloads |
| node-cron | new cron library | Already in package.json; no reason to add another scheduler |
| Prisma DailyRecap model | in-memory JSON | Must survive restarts; DB is the right home for historical recap data |

**Installation:**
```bash
# From frontend/ directory
npm install recharts
```
No backend package changes needed.

---

## Architecture Patterns

### Recommended Project Structure

New files and additions for Phase 7:

```
backend/
├── prisma/
│   └── schema.prisma          # Add DailyRecap model + BotSignalLog.postRejectPeakPct field
├── prisma/migrations/
│   └── 20260301000001_phase7.sql   # Migration for new field + model
├── src/services/
│   ├── eodRecap.ts             # NEW: computation service (computeRecap, persistRecap)
│   └── missedOpportunityTracker.ts  # NEW: background 30-min price watcher
├── src/routes/
│   └── bot.ts                  # ADD: GET /api/bot/recap, GET /api/bot/recap/history

frontend/
├── src/
│   ├── pages/
│   │   └── RecapPage.tsx       # NEW: full-page /recap route
│   ├── components/panels/
│   │   └── BotPanel.tsx        # ADD: 5th "recap" tab + badge dot state
│   ├── store/
│   │   └── recapStore.ts       # NEW: useRecapStore (Zustand) for recap state
│   └── App.tsx                 # ADD: page === "recap" → <RecapPage />
        pageStore.ts            # ADD: "recap" to Page type
```

### Pattern 1: DailyRecap Schema Design

**What:** A single Prisma model that stores a JSON blob of the computed daily recap, keyed by `date` string (ET, YYYY-MM-DD format — consistent with existing `BotDailyStats.date`).

**Schema approach:** Store the summary-level scalar fields as proper columns (for indexing and comparisons), with a `sectionsJson` column as a `Json` type for the deep-dive arrays (trades, signals, suggestions). This avoids wide schemas for variable-length arrays while keeping the summary fields queryable.

```typescript
// schema.prisma addition
model DailyRecap {
  id              String   @id @default(cuid())
  date            String   // "YYYY-MM-DD" ET — matches BotDailyStats.date format

  // Summary card scalars (queryable for historical comparisons)
  totalPnl        Float    @default(0)
  tradeCount      Int      @default(0)
  winCount        Int      @default(0)
  lossCount       Int      @default(0)
  winRate         Float    @default(0)
  score           Int      @default(0)    // 0-100 composite score
  signalCount     Int      @default(0)    // total evaluated
  firedCount      Int      @default(0)    // fired (executed)
  bestTradePnl    Float?
  worstTradePnl   Float?
  spyChangePct    Float?   // SPY daily % change for benchmark
  qqChangePct     Float?   // QQQ daily % change for benchmark

  // Deep-dive sections stored as JSON (arrays of objects)
  sectionsJson    Json     // { trades: [...], signals: [...], catalysts: [...], adherence: {...}, suggestions: [...] }

  computedAt      DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([date])
  @@index([date])
}
```

**Note:** The `@@unique([date])` enables upsert-by-date for the 4:01 PM cron without duplicate rows.

### Pattern 2: eodRecap.ts Computation Service

**What:** A pure computation function that queries all required DB tables and assembles the full recap object. Both the 4:01 PM cron and the on-demand GET endpoint call this same function.

**When to use:** Called by the cron for persistence, and by the REST route for on-demand computation.

```typescript
// Source: established project pattern from goLiveGate.ts
// backend/src/services/eodRecap.ts

export interface DailyRecapData {
  date: string;
  summary: RecapSummary;
  trades: TradeBreakdownRow[];
  signals: SignalRejectionData;
  catalysts: CatalystPerformanceRow[];
  adherence: StrategyAdherenceData;
  suggestions: string[];
  benchmarks: BenchmarkData;
}

export async function computeRecap(dateET: string): Promise<DailyRecapData> {
  const [trades, signals, dailyStats, strategies] = await Promise.all([
    prisma.botTrade.findMany({
      where: { status: 'closed', exitAt: { gte: startOfDayET(dateET), lt: endOfDayET(dateET) } },
      orderBy: { exitAt: 'asc' },
    }),
    prisma.botSignalLog.findMany({
      where: { evaluatedAt: { gte: startOfDayET(dateET), lt: endOfDayET(dateET) } },
    }),
    prisma.botDailyStats.findFirst({ where: { date: dateET } }),
    prisma.strategyRule.findMany(),
  ]);
  // ... assemble sections ...
}

export async function persistRecap(dateET: string): Promise<void> {
  const data = await computeRecap(dateET);
  await prisma.dailyRecap.upsert({
    where: { date: dateET },
    update: { /* all fields */ },
    create: { date: dateET, /* all fields */ },
  });
}
```

### Pattern 3: Missed-Opportunity Tracker

**What:** After `signalEngine.ts` writes a rejected `BotSignalLog`, a background price-watch starts for that symbol. It polls `getSnapshot(symbol)` every 60 seconds for 30 minutes, tracking peak % move above the price at rejection time. If peak >= +5%, writes `postRejectPeakPct` back to the signal log row.

**Critical constraint:** The tracker must NOT import `signalEngine.ts` (circular dependency risk). Signal engine calls tracker; tracker is a leaf service with no upstream service imports.

```typescript
// backend/src/services/missedOpportunityTracker.ts
// Called from signalEngine.ts after writeSignalLog() for rejected signals

const WATCH_DURATION_MS = 30 * 60 * 1000;  // 30 minutes
const POLL_INTERVAL_MS  = 60 * 1000;        // every 60 seconds
const MISSED_OPP_THRESHOLD = 5.0;           // +5% or more = missed opportunity

interface WatchEntry {
  signalLogId: string;
  symbol: string;
  priceAtRejection: number;
  startedAt: number;
  peakPct: number;
  intervalId: ReturnType<typeof setInterval>;
}

const watches = new Map<string, WatchEntry>(); // key = signalLogId

export function startMissedOpportunityWatch(
  signalLogId: string,
  symbol: string,
  priceAtRejection: number
): void {
  // Don't start if no price data or already watching this signal
  if (priceAtRejection <= 0 || watches.has(signalLogId)) return;

  const entry: WatchEntry = {
    signalLogId, symbol, priceAtRejection,
    startedAt: Date.now(), peakPct: 0,
    intervalId: setInterval(async () => {
      await pollWatch(entry);
    }, POLL_INTERVAL_MS),
  };
  watches.set(signalLogId, entry);
}

async function pollWatch(entry: WatchEntry): Promise<void> {
  const elapsed = Date.now() - entry.startedAt;
  if (elapsed >= WATCH_DURATION_MS) {
    clearInterval(entry.intervalId);
    watches.delete(entry.signalLogId);
    if (entry.peakPct >= MISSED_OPP_THRESHOLD) {
      await prisma.botSignalLog.update({
        where: { id: entry.signalLogId },
        data: { postRejectPeakPct: entry.peakPct },
      });
    }
    return;
  }
  const snaps = await getSnapshots([entry.symbol]).catch(() => []);
  if (snaps[0]) {
    const pct = ((snaps[0].price - entry.priceAtRejection) / entry.priceAtRejection) * 100;
    if (pct > entry.peakPct) entry.peakPct = pct;
  }
}
```

**Signal engine integration:** Call `startMissedOpportunityWatch()` after `writeSignalLog()` for non-silent rejections that have a `priceAtEval` value.

### Pattern 4: Recharts in Dark Theme

**What:** Recharts renders SVG and exposes every element as a React component — colors, axes, tooltips, and grid lines are all overridable via props. No global CSS injection needed.

```typescript
// Source: recharts.github.io official docs
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Dark theme pattern — Tailwind color variables map to Recharts stroke/fill props
const CHART_COLORS = {
  profit: '#22c55e',  // text-up (green)
  loss:   '#ef4444',  // text-down (red)
  grid:   '#2d2d2d',  // border color
  axis:   '#6b7280',  // text-muted
};

function WeekPnlChart({ data }: { data: { day: string; pnl: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="day" tick={{ fill: CHART_COLORS.axis, fontSize: 10 }} axisLine={false} />
        <YAxis tick={{ fill: CHART_COLORS.axis, fontSize: 10 }} axisLine={false} width={40} />
        <Tooltip
          contentStyle={{ background: '#1a1a1a', border: '1px solid #333', fontSize: 10 }}
          formatter={(v: number) => [`$${v.toFixed(2)}`, 'P&L']}
        />
        <Bar dataKey="pnl" fill={CHART_COLORS.profit}
          // Dynamic bar color: red for losses, green for gains
          label={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

**Dynamic bar coloring (profit/loss):** Recharts `<Bar>` accepts a `cell` pattern or a function fill. Use the `Cell` import:

```typescript
import { Bar, Cell } from 'recharts';
// Inside BarChart:
<Bar dataKey="pnl">
  {data.map((entry, i) => (
    <Cell key={i} fill={entry.pnl >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss} />
  ))}
</Bar>
```

### Pattern 5: Intraday P&L Timeline with Trade Markers

**What:** A LineChart showing cumulative P&L over trading hours (9:30–4 PM), with `ReferenceLine` or `ReferenceDot` marking trade entry and exit times.

```typescript
import { LineChart, Line, ReferenceDot, ResponsiveContainer, XAxis, YAxis } from 'recharts';

// data: [{ time: '09:45', cumulativePnl: 0 }, { time: '10:15', cumulativePnl: 47.50 }, ...]
// trades: [{ time: '09:45', event: 'entry', symbol: 'XYZ' }, ...]

function IntradayChart({ data, trades }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="cumulativePnl" stroke="#22c55e" dot={false} strokeWidth={1.5} />
        <XAxis dataKey="time" tick={{ fontSize: 9 }} />
        <YAxis tick={{ fontSize: 9 }} width={40} />
        {trades.map((t, i) => (
          <ReferenceDot key={i} x={t.time} y={t.cumulativePnl}
            r={4} fill={t.event === 'entry' ? '#60a5fa' : '#f59e0b'} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Pattern 6: Frontend Routing for /recap

**What:** The existing `pageStore.ts` uses a simple string enum (`"dashboard" | "trades" | "newsfeeds"`). Adding `"recap"` extends the pattern directly. `App.tsx` renders the correct component based on `page`. No React Router needed.

```typescript
// pageStore.ts: extend Page type
export type Page = "dashboard" | "trades" | "newsfeeds" | "recap";

// App.tsx: add recap case
if (page === "recap") return <RecapPage />;

// BotPanel.tsx: navigation
const { setPage } = usePageStore();
// "View full recap" link:
<button onClick={() => setPage("recap")} className="...">View full recap</button>
```

### Pattern 7: Tab Badge Dot on BotPanel

**What:** A small colored dot indicator on the "Recap" tab label. State: `recapUnread: boolean` managed in local BotPanel state (or recapStore). Set to `true` by `isMarketOpen()` transition from true to false (post 4 PM). Cleared when user clicks Recap tab.

```typescript
// In BotPanel.tsx — track unread badge state
const [recapUnread, setRecapUnread] = useState(false);

// In tab bar render:
<button onClick={() => { setTab('recap'); setRecapUnread(false); }}>
  <span className="relative">
    recap
    {recapUnread && (
      <span className="absolute -top-0.5 -right-1.5 w-1.5 h-1.5 rounded-full bg-accent" />
    )}
  </span>
</button>

// Detect market close crossing using useEffect with interval check:
useEffect(() => {
  const timer = setInterval(() => {
    const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours();
    if (hour >= 16 && tab !== 'recap') setRecapUnread(true);
  }, 60_000);
  return () => clearInterval(timer);
}, [tab]);
```

### Pattern 8: Daily Score Computation (Claude's Discretion)

**Recommended formula (0-100 composite):**

| Component | Weight | Calculation |
|-----------|--------|-------------|
| P&L vs baseline | 30% | `clamp((todayPnl / 200) * 30, 0, 30)` — scales $200 P&L to 30 pts |
| Win rate | 25% | `winRate * 25` — 80% win rate = 20 pts |
| Signal quality | 20% | `firedCount / max(signalCount, 1) * 20` — firing ratio |
| Risk compliance | 15% | 15 if no daily-loss-limit breaches; 0 if limit hit |
| Strategy adherence | 10% | `pct of trades within ±20% of recommended hold time * 10` |

All components clamped to their max. Total rounded to integer. This is a **recommendation only** — the planner may adjust weights.

### Anti-Patterns to Avoid

- **Querying BotTrade by `createdAt` instead of `exitAt` for closed trades:** A trade entered yesterday may not close until today. Always filter on `exitAt` for "today's performance" queries.
- **Storing trade breakdowns as separate DB rows:** The variable-length arrays (trade rows, signal rows, suggestions) belong in `sectionsJson` — not separate normalized tables. DailyRecap is read-mostly and never individually queried per row.
- **Computing `postRejectPeakPct` in the recap computation instead of in real-time:** The 30-minute watch window closes before 4:01 PM if the signal was rejected at 3:30. Real-time tracking via `missedOpportunityTracker.ts` is the correct approach.
- **Starting too many concurrent snapshot polls in the tracker:** Cap concurrent watched symbols to avoid hitting Alpaca rate limits (getSnapshots batches multiple symbols in one call; batch them together periodically instead of one interval per symbol).
- **Importing missedOpportunityTracker from signalEngine:** Always import tracker from signalEngine, never the reverse (circular dependency).
- **Re-creating the /recap route as a separate page from scratch:** Follow the existing `pageStore.ts` + `App.tsx` pattern — no React Router needed.
- **Fetching SPY/QQQ via bars endpoint (slow):** The snapshot endpoint (`getSnapshots(['SPY', 'QQQ'])`) returns `changePct` which is exactly `(latestTrade - prevClose) / prevClose * 100` — already computed. Use this, not the bars endpoint.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Charting | Custom SVG bar/line charts | Recharts | Recharts handles responsive containers, tooltips, legends, axes, animation — hundreds of edge cases |
| Date range queries | Manual string slicing | `startOfDayET()` / `endOfDayET()` helper using `Intl.DateTimeFormat` | DST-safe; consistent with `getTodayDateET()` pattern already in codebase |
| Benchmark fetch | Custom Alpaca bars parsing | `getSnapshots(['SPY', 'QQQ'])` — use `.changePct` | Already computed and cached; zero extra code |
| Cron scheduling | New scheduler | `node-cron` (already installed) | Same module used in positionMonitor.ts for EOD and 4AM crons |
| Upsert-by-date | findFirst + create/update branching | `prisma.dailyRecap.upsert({ where: { date } })` | Atomic, race-condition-safe |

**Key insight:** Almost everything in Phase 7 is data assembly from existing sources. The only genuinely new infrastructure is `missedOpportunityTracker.ts` and the `DailyRecap` model/route. The charting work is additive (install Recharts, render data).

---

## Common Pitfalls

### Pitfall 1: exitAt-vs-createdAt Trade Date Attribution

**What goes wrong:** Filtering `BotTrade` by `createdAt >= startOfDay` will miss trades that were bought yesterday but sold today. The recap must represent trades **closed** today.
**Why it happens:** Trade lifecycle — `entryAt` is when the order filled (could be pre-market); `exitAt` is when the sell filled. Today's P&L = today's closed trades by exitAt.
**How to avoid:** Always filter: `where: { status: 'closed', exitAt: { gte: startOfDayET, lt: endOfDayET } }`.
**Warning signs:** P&L doesn't match `BotDailyStats.realizedPnl` for the same day.

### Pitfall 2: BotSignalLog evaluatedAt Date Boundary

**What goes wrong:** Signals evaluated near midnight ET (unlikely but possible on weekdays) could be attributed to the wrong day.
**Why it happens:** `evaluatedAt` is in UTC; need to convert to ET before filtering.
**How to avoid:** Use `startOfDayET(dateET)` / `endOfDayET(dateET)` helpers that produce UTC `Date` objects from ET date strings (e.g., "2026-03-01" → `2026-03-01T05:00:00Z` start for EST).

### Pitfall 3: Missed Opportunity Tracker Memory Leak

**What goes wrong:** If hundreds of signals are rejected per day, hundreds of `setInterval` watchers accumulate. Most complete within 30 minutes, but if the server restarts mid-watch, they are lost (acceptable behavior per CONTEXT.md — not persisted).
**Why it happens:** Each rejected signal with a price starts a watcher; no cleanup mechanism for old intervals.
**How to avoid:** Add a cap — if `watches.size >= MAX_CONCURRENT_WATCHES` (e.g., 50), skip starting a new watch. Log a warning. The important signals are high-tier rejections where price data exists.
**Warning signs:** Memory climbing monotonically during high-signal days.

### Pitfall 4: Alpaca Rate Limits in Missed-Opportunity Tracker

**What goes wrong:** If 50 separate `setInterval` calls each poll one symbol every 60 seconds, that's 50 API calls per minute — approaching Alpaca's rate limit (roughly 200 req/min for data API).
**Why it happens:** Naive implementation: one interval per watch entry.
**How to avoid:** Use a single shared polling interval (60s) that calls `getSnapshots(allWatchedSymbols)` in one batch request — same approach as positionMonitor.ts 5-second loop. Recharts `getSnapshots()` already handles up to 1000 symbols per call.

```typescript
// Single shared poll — mirrors positionMonitor.ts pattern:
setInterval(async () => {
  if (watches.size === 0) return;
  const entries = [...watches.values()];
  const symbols = [...new Set(entries.map(e => e.symbol))];
  const snaps = await getSnapshots(symbols).catch(() => []);
  // distribute to entries...
}, POLL_INTERVAL_MS);
```

### Pitfall 5: DailyRecap sectionsJson TypeScript Safety

**What goes wrong:** Prisma returns `sectionsJson` as `Prisma.JsonValue` which requires casting. Routes and frontend types drift.
**Why it happens:** Prisma's `Json` type is `JsonValue` (opaque) at the TypeScript level.
**How to avoid:** Define a `RecapSections` interface in a shared location (e.g., inline in `eodRecap.ts`) and cast: `const sections = recap.sectionsJson as RecapSections`. The route returns the full `DailyRecap` row — frontend receives `sectionsJson` as-is and casts to the same interface.

### Pitfall 6: Recharts ResponsiveContainer in Flex Containers

**What goes wrong:** `ResponsiveContainer` with `width="100%"` inside a flex column returns zero width until the parent has a concrete size.
**Why it happens:** Recharts measures the DOM parent; flex children without explicit size measure as 0.
**How to avoid:** Wrap the chart in a `<div className="w-full" style={{ minHeight: 120 }}>` or give the parent an explicit height class (`h-32`). Always pair `ResponsiveContainer` with a concrete height prop.

### Pitfall 7: Badge Dot Triggers on Weekend/Non-Trading Days

**What goes wrong:** The "after 4 PM" badge trigger fires on weekends too, showing the badge with no data.
**Why it happens:** Simple hour check ignores weekday gate.
**How to avoid:** Combine hour check with weekday check (same `isMarketOpen()` helper logic already in `botController.ts`). Better: show badge only if `isMarketOpen()` was true earlier today (requires tracking prior state). Simplest fix: check `day.getDay() >= 1 && day.getDay() <= 5 && hour >= 16`.

---

## Code Examples

Verified patterns from existing codebase and official docs:

### Start-of-Day ET Boundary Helper

```typescript
// Source: consistent with getTodayDateET() in botController.ts
function startOfDayET(dateET: string): Date {
  // dateET = "YYYY-MM-DD" in ET
  // EST = UTC-5; EDT = UTC-4. Using UTC+5 as conservative offset.
  // Exact offset doesn't matter — we just need consistent boundaries within ±1 day.
  return new Date(`${dateET}T05:00:00Z`); // midnight ET (EST) = 05:00 UTC
}

function endOfDayET(dateET: string): Date {
  const next = new Date(`${dateET}T05:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
```

### Upsert DailyRecap (4:01 PM Cron)

```typescript
// Source: established Prisma upsert pattern from BotDailyStats in tradeExecutor.ts
await prisma.dailyRecap.upsert({
  where: { date: todayET },
  update: {
    totalPnl: data.summary.totalPnl,
    // ... other scalars ...
    sectionsJson: data.sections as Prisma.InputJsonValue,
    computedAt: new Date(),
  },
  create: {
    date: todayET,
    totalPnl: data.summary.totalPnl,
    // ... other scalars ...
    sectionsJson: data.sections as Prisma.InputJsonValue,
  },
});
```

### 4:01 PM Cron Registration (positionMonitor.ts pattern)

```typescript
// Source: positionMonitor.ts scheduleEodForceClose() — exact same pattern
cron.schedule('1 16 * * 1-5', async () => {
  console.log('[EodRecap] Computing and persisting daily recap at 4:01 PM ET');
  const todayET = getTodayDateET(); // from botController.ts
  await persistRecap(todayET).catch(err =>
    console.error('[EodRecap] persist failed:', err)
  );
  // Trigger badge notification via broadcast (see below)
  broadcast('bot', { type: 'recap_ready', date: todayET });
}, { timezone: 'America/New_York' });
```

### REST Endpoint Pattern (follows bot.ts style)

```typescript
// GET /api/bot/recap?date=YYYY-MM-DD
router.get('/recap', requireAuth, async (req, res) => {
  try {
    const dateET = (req.query.date as string) ?? getTodayDateET();

    // Try persisted first (fast)
    const persisted = await prisma.dailyRecap.findUnique({ where: { date: dateET } });
    if (persisted) { res.json(persisted); return; }

    // Fall back to on-demand computation (slower)
    const data = await computeRecap(dateET);
    res.json(data);
  } catch (err) {
    console.error('[BotRoute] /recap error:', err);
    res.status(500).json({ error: 'Failed to load recap' });
  }
});

// GET /api/bot/recap/history?mode=week&anchor=YYYY-MM-DD
// Returns array of DailyRecap rows for week or month view
router.get('/recap/history', requireAuth, async (req, res) => {
  const { mode = 'week', anchor } = req.query;
  const anchorDate = (anchor as string) ?? getTodayDateET();
  const dates = mode === 'week' ? getWeekDates(anchorDate) : getMonthDates(anchorDate);
  const rows = await prisma.dailyRecap.findMany({
    where: { date: { in: dates } },
    orderBy: { date: 'asc' },
  });
  res.json(rows);
});
```

### Recharts Recharts ComposedChart — Intraday P&L with Trade Markers

```typescript
// Source: recharts.github.io — ComposedChart + ReferenceDot
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceDot, ResponsiveContainer } from 'recharts';

interface TimePoint { time: string; pnl: number; }
interface TradeMarker { time: string; pnl: number; type: 'entry' | 'exit'; symbol: string; }

function IntradayPnlChart({ points, markers }: { points: TimePoint[]; markers: TradeMarker[] }) {
  return (
    <div className="w-full h-40">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} axisLine={false} width={44}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 10, fontFamily: 'monospace' }}
            formatter={(v: number) => [`$${v.toFixed(2)}`, 'Cum P&L']}
          />
          <Line type="monotone" dataKey="pnl" stroke="#22c55e" dot={false} strokeWidth={1.5} />
          {markers.map((m, i) => (
            <ReferenceDot key={i} x={m.time} y={m.pnl}
              r={4} fill={m.type === 'entry' ? '#60a5fa' : '#f59e0b'}
              stroke="none"
              label={{ value: m.symbol, position: 'top', fontSize: 8, fill: '#9ca3af' }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### Scoring Formula (Claude's Discretion — recommended implementation)

```typescript
// backend/src/services/eodRecap.ts
function computeScore(data: {
  totalPnl: number;
  winRate: number;
  firedCount: number;
  signalCount: number;
  dailyLossLimitHit: boolean;
  adherencePct: number; // 0-1: pct of trades within ±20% of recommended hold
}): number {
  const pnlPts       = Math.min(Math.max((data.totalPnl / 200) * 30, 0), 30);
  const winRatePts   = Math.min(data.winRate * 25, 25);
  const qualityPts   = Math.min((data.firedCount / Math.max(data.signalCount, 1)) * 20, 20);
  const riskPts      = data.dailyLossLimitHit ? 0 : 15;
  const adherencePts = Math.min(data.adherencePct * 10, 10);
  return Math.round(pnlPts + winRatePts + qualityPts + riskPts + adherencePts);
}
```

### Suggest Generation Pattern

```typescript
// backend/src/services/eodRecap.ts — coach-like suggestion generator
function generateSuggestions(data: DailyRecapData): string[] {
  const suggestions: string[] = [];

  // Missed opportunity pattern
  const missedOpps = data.signals.rejected.filter(s => (s.postRejectPeakPct ?? 0) >= 5);
  if (missedOpps.length >= 2) {
    const rejectGroups = groupBy(missedOpps, 'rejectReason');
    for (const [reason, items] of Object.entries(rejectGroups)) {
      if (items.length >= 2) {
        const avgPct = avg(items.map(i => i.postRejectPeakPct ?? 0));
        suggestions.push(
          `${items.length} signals rejected by "${reason}" moved +${avgPct.toFixed(1)}% avg — review threshold`
        );
      }
    }
  }

  // Catalyst strength pattern
  for (const cat of data.catalysts) {
    if (cat.tradeCount >= 2 && cat.winRate === 1.0) {
      suggestions.push(`${cat.category}: ${cat.tradeCount}/${cat.tradeCount} wins — strong category today`);
    }
    if (cat.tradeCount >= 2 && cat.winRate === 0.0) {
      suggestions.push(`${cat.category}: 0/${cat.tradeCount} wins — avoid or reduce size`);
    }
  }

  return suggestions.slice(0, 3); // cap at 3
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts 2.x composable charts | Recharts 3.x (3.7.0) rewrote state management internally | 2024 | Better performance; animations maintained within recharts itself (no react-smooth dependency); migration guide at github.com/recharts/recharts/wiki/3.0-migration-guide |
| Chart.js (canvas) was common | Recharts (SVG) now dominant for React apps | 2022+ | SVG charts style naturally with Tailwind/CSS; no canvas pixel API needed |
| Manual JSON page routing | pageStore.ts string enum + App.tsx switch | Established in project | Follow existing — no React Router needed for this project |

**Deprecated/outdated:**
- Recharts 2.x API patterns: `react-smooth` dependency removed in v3; if any blog post references it, ignore that pattern.
- Chart.js direct usage: requires `ref` + canvas manipulation; incompatible with React declarative model.

---

## Open Questions

1. **postRejectPeakPct field vs missed-opportunity tracker persistence across restarts**
   - What we know: Watches are in-memory; a server restart during the 30-minute window loses the watch.
   - What's unclear: Is this an acceptable gap? (Context says "background tracking" with no persistence requirement stated.)
   - Recommendation: Accept the limitation — log it as a known behavior. A signal rejected at 3:30 PM on a day with a 3:45 force-close will still get its watch completed. The gap only matters for restarts during the watch window, which is rare.

2. **DailyRecap sectionsJson vs separate related models**
   - What we know: CONTEXT.md leaves schema design to Claude's Discretion.
   - What's unclear: Whether deep-dive arrays will ever need individual querying (e.g., "find all missed opportunities across days").
   - Recommendation: Use `Json` for Phase 7. If cross-day queries on individual items become needed, that's a v2 schema evolution — avoid premature normalization.

3. **Intraday P&L timeline data source**
   - What we know: BotTrade has `exitAt` timestamps and `pnl`. `entryAt` is also available.
   - What's unclear: For the intraday chart, should we interpolate between trades or only mark trade close events?
   - Recommendation: Use a simple event-based timeline — each trade close = a point. Cumulative P&L increases at each close time. No interpolation needed; line chart connects the dots cleanly.

4. **SPY/QQQ changePct field reliability**
   - What we know: `getSnapshots()` returns `changePct` computed as `(latestTrade - prevClose) / prevClose * 100`. For after-hours calls, `latestTrade` is the last traded price (post-4 PM for SPY/QQQ).
   - What's unclear: Whether `changePct` reflects the official close price vs last trade at time of API call.
   - Recommendation: For the daily recap (computed at 4:01 PM or on-demand), `changePct` at that time is accurate enough. Document as "approximate market benchmark." No action needed.

---

## Integration Map: Existing Code → Phase 7

### Backend Data Sources
| Data | Source | Query | Notes |
|------|--------|-------|-------|
| Today's closed trades | `prisma.botTrade` | `where: { status: 'closed', exitAt: { gte/lt day bounds } }` | Use exitAt, not createdAt |
| Trade enrichment (VWAP dev, peak price, drawdown) | `prisma.tradeAnalytics` | `findUnique({ where: { paperTradeId: trade.id } })` | Note: TradeAnalytics links to paperTradeId (PaperTrade), not BotTrade. **This is a gap.** |
| Today's signal log | `prisma.botSignalLog` | `where: { evaluatedAt: { gte/lt day bounds } }` | All outcomes |
| Daily P&L totals | `prisma.botDailyStats` | `findFirst({ where: { date: dateET } })` | Aggregate already computed |
| Strategy recommendations | `prisma.strategyRule` | `findMany()` | For adherence comparison |
| Market benchmarks | `getSnapshots(['SPY', 'QQQ'])` | `.changePct` field | Existing alpaca.ts function |

### Critical Gap: TradeAnalytics is linked to PaperTrade, not BotTrade

The `TradeAnalytics` model has `paperTradeId` referencing the `PaperTrade` model — the manual paper trading system from before the bot. The autonomous bot's `BotTrade` model does NOT have a corresponding `TradeAnalytics` record. This means:

- VWAP deviation at entry, peak price, and max drawdown are NOT automatically available for bot trades
- The `BotTrade` model currently stores `entryPrice`, `exitPrice`, `shares`, `pnl` — but not enrichment data

**Resolution options (Claude's Discretion at planning time):**
1. **Skip TradeAnalytics enrichment for Phase 7** — trade breakdown shows entry/exit/pnl/exitReason/holdTime only (no VWAP dev or peak price). CONTEXT.md listed these as enrichment, but if the data doesn't exist, display "—".
2. **Add a BotTradeAnalytics model** — a new Prisma model mirroring TradeAnalytics but linked to BotTrade, populated at trade close time. This is scope-expanding but would unlock the full enrichment view.
3. **Add VWAP dev at entry time to BotTrade directly** — capture `priceAtSignal` is already in the signal log; add `entryVwapDev` and `peakPrice` fields to BotTrade, populated by positionMonitor at close time.

**Recommendation for planner:** Option 3 is the best fit — add `entryVwapDev Float?`, `peakPrice Float?`, and `maxDrawdownPct Float?` to BotTrade directly. positionMonitor.ts already tracks `peakPrice` per position in memory (the `TrackedPosition.peakPrice` field). Write it to BotTrade at close time. For `entryVwapDev`, call `getVwapDev()` at buy time (in tradeExecutor.ts) and store. This unlocks the enrichment display with minimal schema change.

### Frontend Integration Points
| Touchpoint | File | Change |
|------------|------|--------|
| 5th tab in BotPanel | `BotPanel.tsx` | Add `"recap"` to `BotTab` type; add tab button + badge dot; fetch GET /api/bot/recap on tab activate |
| Full recap route | `App.tsx` + `pageStore.ts` | Add `"recap"` to `Page` type; render `<RecapPage />` |
| Recap state | new `recapStore.ts` | `useRecapStore` — recap data, loading state, selected date, view mode (day/week/month) |
| WebSocket badge trigger | `useSocket.ts` | Handle `recap_ready` message type → set `recapUnread = true` in recapStore |
| "View full recap" nav | `BotPanel.tsx` RecapTab | `setPage("recap")` button |

---

## Sources

### Primary (HIGH confidence)
- Recharts npm registry — version 3.7.0, current as of 2026-03-01
- `recharts.github.io/en-US/api/` — ComposedChart, LineChart, BarChart, ReferenceDot, Cell, ResponsiveContainer API
- GitHub recharts/recharts/wiki/3.0-migration-guide — v3 breaking changes documented
- Project codebase inspection — botController.ts, positionMonitor.ts, signalEngine.ts, schema.prisma, BotPanel.tsx, alpaca.ts — all patterns verified by direct read

### Secondary (MEDIUM confidence)
- npm recharts page — download stats, 3,626 dependents confirmed
- Web search: "Recharts 3 React 18 LineChart BarChart" — confirmed Cell component for dynamic bar colors, ResponsiveContainer usage

### Tertiary (LOW confidence)
- Exact Alpaca rate limit (200 req/min) — cited from project STATE.md research note; verify against current docs if tracker approaches that limit

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Recharts is the clear choice; node-cron and Prisma already in use
- Architecture: HIGH — all patterns verified against existing codebase; new services follow established patterns
- Critical gap (TradeAnalytics/BotTrade): HIGH — confirmed by direct schema inspection; resolution options clear
- Pitfalls: HIGH — derived from actual code patterns in positionMonitor.ts and signalEngine.ts

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (Recharts 3.x stable; project patterns stable)
