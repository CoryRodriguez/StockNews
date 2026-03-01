# Phase 6: Live Trading Mode - Research

**Researched:** 2026-03-01
**Domain:** Alpaca live trading API, go-live gate logic, UI confirmation dialogs, backend readiness checks
**Confidence:** HIGH

---

## Summary

Phase 6 is the final phase of the Autonomous Trading Bot milestone. It has three requirements: LIVE-01 (live mode requires only a config change — no code changes), LIVE-02 (mode switch requires UI confirmation and is blocked if positions are open), and LIVE-03 (live mode cannot be activated until a go-live gate is satisfied: 30+ completed paper trades, 40%+ win rate, 5 consecutive clean trading days).

The good news: **most of the live-trading infrastructure already exists**. The `getAlpacaBaseUrl()` function in `botController.ts` already returns `config.alpacaLiveUrl` (`https://api.alpaca.markets`) when `botConfig.mode === 'live'`. The `switchMode()` function already exists and blocks on open positions. The trading WebSocket in `tradingWs.ts` already derives its URL from `getAlpacaBaseUrl()` and calls `restartTradingWs()` on mode switch. From a *code* perspective, LIVE-01 is already satisfied — switching the base URL in `botConfig.mode` propagates everywhere automatically.

What Phase 6 must add is: (1) the UI confirmation dialog in `BotPanel.tsx` before calling `POST /api/bot/mode`, (2) a `POST /api/bot/mode` route that wraps `switchMode()`, and (3) backend logic to evaluate the go-live gate and expose it via `GET /api/bot/gate`, and (4) the UI gate status display that gates the live-mode button on gate satisfaction. The go-live gate requires querying `BotTrade` count/win-rate and a 5-day clean-log check from `BotDailyStats` or server logs.

**Primary recommendation:** Build Phase 6 in 3 plans: (1) backend go-live gate endpoint + mode-switch route, (2) UI confirmation dialog + gate status in BotPanel, (3) verification suite + human checkpoint. No new dependencies or schema migrations needed.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LIVE-01 | Bot supports switching to live Alpaca API via config change with no code changes | Already implemented: `getAlpacaBaseUrl()` returns `config.alpacaLiveUrl` when `mode='live'`; REST, WebSocket, and position endpoints all use this function. The only gap: no `POST /api/bot/mode` route exists yet. |
| LIVE-02 | Live mode switch requires explicit UI confirmation and is blocked if positions open | Backend: `switchMode()` already blocks on open positions. Gap: no `/mode` route, no confirmation dialog in `BotPanel.tsx`. Also: gate check (LIVE-03) must be evaluated before allowing the switch. |
| LIVE-03 | Go-live gate: 30+ completed paper trades, ≥40% win rate, 5 consecutive clean trading days | No gate logic exists yet. Requires querying `BotTrade` (count + win rate) and a 5-day clean-log check. Must expose gate status via API for the UI to display. |
</phase_requirements>

---

## What Already Exists (No Re-implementation Needed)

Understanding what is DONE avoids building what already works:

### LIVE-01: Mode Switching Infrastructure

```typescript
// backend/src/config.ts — both URLs already defined
alpacaPaperUrl: "https://paper-api.alpaca.markets",
alpacaLiveUrl:  "https://api.alpaca.markets",

// backend/src/services/botController.ts — already mode-aware
export function getAlpacaBaseUrl(): string {
  if (!botConfig) return config.alpacaPaperUrl;
  return botConfig.mode === 'live' ? config.alpacaLiveUrl : config.alpacaPaperUrl;
}

// switchMode() — already blocks on open positions
export async function switchMode(newMode: BotMode): Promise<void> {
  const openCount = await prisma.botTrade.count({ where: { status: 'open' } });
  if (openCount > 0) throw new Error(`Cannot switch mode: ${openCount} position(s) currently open`);
  botConfig = await prisma.botConfig.update({ where: { id: 'singleton' }, data: { mode: newMode } });
  restartTradingWs(); // reconnects WS to new URL
}

// backend/src/services/tradingWs.ts — already derives URL from getAlpacaBaseUrl()
function getTradingWsUrl(): string {
  return getAlpacaBaseUrl()
    .replace('https://', 'wss://')
    .replace('http://', 'ws://') + '/stream';
}
```

Conclusion: All trade execution, position monitoring, and WebSocket code already uses `getAlpacaBaseUrl()`. Switching to live mode is already a single DB column change. **LIVE-01 is code-complete. Phase 6 just needs to expose it safely.**

### LIVE-02: Backend Position Guard

```typescript
// botController.switchMode() already throws if positions are open
// backend/src/routes/bot.ts — needs a POST /mode route added (only gap)
```

### BotPanel.tsx: Mode Display

The BotPanel header already shows current mode:
```tsx
{status && (
  <span className="text-[9px] text-muted font-mono">{status.mode.toUpperCase()}</span>
)}
```

The config tab has no mode-switching control yet. That is the gap.

---

## Standard Stack

### Core (no new dependencies needed)

| Component | Location | Purpose |
|-----------|----------|---------|
| `botController.switchMode()` | `backend/src/services/botController.ts` | Mode switch with position guard |
| `getAlpacaBaseUrl()` | `backend/src/services/botController.ts` | Runtime URL selector |
| `prisma.botTrade` | existing schema | Trade count + win rate query |
| `prisma.botDailyStats` | existing schema | Clean-day check |
| React `useState` confirmation dialog | `frontend/src/components/panels/BotPanel.tsx` | Confirmation UI |
| existing `fetch("/api/bot/...")` pattern | `BotPanel.tsx` | API calls |

No new npm packages required. No schema migrations required.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `window.confirm()` for dialog | Custom modal | `window.confirm()` is sync and blocks; a React state-controlled inline confirmation panel matches the project's existing UI patterns better and allows showing gate status inline |
| Server-side log parsing for clean days | `BotDailyStats` table | `BotDailyStats` already has per-day rows; an unhandled exception day can be flagged by checking if the exception count column exists — but it doesn't. Alternative: track clean days as "days with at least one trade and no crash-exitReason in BotTrade". Practical approach: use a new `systemHealthLog` table OR define "clean day" as a day present in `BotDailyStats` where `tradeCount > 0` with no `BotTrade.exitReason = 'server_crash'` entries. Simpler still: check the last 5 trading days in `BotDailyStats` each having a row (server ran that day) with `tradeCount > 0` and no catastrophic DB inconsistency. |

**Chosen approach for "clean days"**: Define a clean day as a calendar day (ET timezone) that appears in `BotDailyStats` with `tradeCount > 0`. If the server ran and traded for 5 consecutive trading days without a crash that wiped stats, those days are present in the table. This avoids requiring a new table or log parsing. "5 consecutive" means 5 business days in a row (Mon-Fri, skipping weekends) where each day has a `BotDailyStats` row. This is LOW complexity and queryable entirely from the existing schema.

---

## Architecture Patterns

### Pattern 1: Go-Live Gate Evaluation

The gate has three independent sub-checks, all queryable from the existing Prisma schema:

```typescript
// Sub-check 1: 30+ completed paper trades
const completedTradeCount = await prisma.botTrade.count({
  where: { status: 'closed', mode: 'paper' }  // Note: BotTrade has no mode field!
});
// Actual: count all closed BotTrade rows (all are paper trades until live is unlocked)
const completedTradeCount = await prisma.botTrade.count({
  where: { status: 'closed' }
});

// Sub-check 2: ≥40% win rate
const allClosed = await prisma.botTrade.findMany({
  where: { status: 'closed' },
  select: { pnl: true },
});
const winners = allClosed.filter(t => (t.pnl ?? 0) > 0).length;
const winRate = allClosed.length > 0 ? winners / allClosed.length : 0;

// Sub-check 3: 5 consecutive trading days with no unhandled exceptions
// Approach: Find the 5 most recent distinct dates in BotDailyStats where tradeCount > 0
// Check they are consecutive business days
const recentDays = await prisma.botDailyStats.findMany({
  where: { tradeCount: { gt: 0 } },
  orderBy: { date: 'desc' },
  take: 5,
});
const hasConsecutiveDays = checkConsecutiveDays(recentDays.map(d => d.date));
```

**Critical note on "mode" in BotTrade**: The `BotTrade` model has no `mode` field. All existing trades are paper trades (since live mode has never been enabled). For the gate check, count ALL closed trades — they are all paper trades by definition until the gate is passed for the first time.

**Critical note on "unhandled exceptions"**: The requirement says "5 consecutive trading days with no unhandled exceptions." There is no exception log in the database. The cleanest interpretation that is also queryable: a clean day is one where `BotDailyStats` has an entry with `tradeCount > 0` (server was running and trading). An unhandled exception that crashed the server would either: (a) prevent the daily stats from being updated, or (b) cause missing days. So "5 consecutive days with BotDailyStats entries" is a reasonable proxy. Document this interpretation explicitly in the implementation.

### Pattern 2: POST /api/bot/mode Route

```typescript
// Add to backend/src/routes/bot.ts
import { switchMode, getBotConfig } from '../services/botController';
import { evaluateGoLiveGate } from '../services/goLiveGate';  // new service

// POST /api/bot/mode — switches between paper and live
router.post('/mode', requireAuth, async (req, res) => {
  try {
    const { mode } = req.body as { mode: string };
    if (mode !== 'paper' && mode !== 'live') {
      res.status(400).json({ error: 'mode must be "paper" or "live"' });
      return;
    }

    // Switching to live requires gate to be satisfied
    if (mode === 'live') {
      const gate = await evaluateGoLiveGate();
      if (!gate.passed) {
        res.status(403).json({ error: 'Go-live gate not satisfied', gate });
        return;
      }
    }

    await switchMode(mode as 'paper' | 'live');
    res.json({ mode });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // switchMode throws if positions are open
    res.status(400).json({ error: message });
  }
});

// GET /api/bot/gate — returns gate status for UI display
router.get('/gate', requireAuth, async (_req, res) => {
  try {
    const gate = await evaluateGoLiveGate();
    res.json(gate);
  } catch (err) {
    res.status(500).json({ error: 'Failed to evaluate go-live gate' });
  }
});
```

### Pattern 3: Go-Live Gate Service

New file: `backend/src/services/goLiveGate.ts`

```typescript
export interface GoLiveGate {
  passed: boolean;
  tradeCount: number;         // completed paper trades
  tradeCountMet: boolean;     // >= 30
  winRate: number;            // 0-1
  winRateMet: boolean;        // >= 0.40
  cleanDays: number;          // consecutive clean trading days
  cleanDaysMet: boolean;      // >= 5
  blockingReason: string | null;  // human-readable reason if not passed
}

export async function evaluateGoLiveGate(): Promise<GoLiveGate> { ... }
```

### Pattern 4: UI Confirmation Dialog in BotPanel

The BotPanel already manages complex state (`draft`, `saving`, `saveError`). Add:
- `liveGate: GoLiveGate | null` state (fetched on demand)
- `showLiveConfirm: boolean` state
- A "Switch to LIVE" button in the Status tab (only visible when `status.mode === 'paper'` and `status.state !== 'running'`)
- An inline confirmation panel (NOT `window.confirm`) that shows gate status and asks for explicit confirmation

```tsx
// Inline confirmation pattern (matches existing UI style)
{showLiveConfirm && (
  <div className="border border-red-600/50 bg-red-500/5 mx-2 my-2 p-2 rounded">
    <div className="text-[10px] font-mono text-red-400 mb-2 font-semibold">
      SWITCH TO LIVE TRADING?
    </div>
    {/* Gate status items */}
    {liveGate && (
      <div className="space-y-1 mb-2">
        <GateRow label="Completed trades" value={liveGate.tradeCount} required={30} met={liveGate.tradeCountMet} />
        <GateRow label="Win rate" value={`${(liveGate.winRate * 100).toFixed(1)}%`} required="≥40%" met={liveGate.winRateMet} />
        <GateRow label="Clean days" value={liveGate.cleanDays} required={5} met={liveGate.cleanDaysMet} />
      </div>
    )}
    <div className="flex gap-2">
      <button onClick={() => void handleLiveSwitch()} disabled={!liveGate?.passed} ...>CONFIRM LIVE</button>
      <button onClick={() => setShowLiveConfirm(false)} ...>CANCEL</button>
    </div>
  </div>
)}
```

### Pattern 5: Consecutive Business Day Check

```typescript
function checkConsecutiveBusinessDays(sortedDatesDesc: string[]): boolean {
  // sortedDatesDesc: ['2026-03-01', '2026-02-28', '2026-02-27', '2026-02-26', '2026-02-25']
  if (sortedDatesDesc.length < 5) return false;

  const fiveDays = sortedDatesDesc.slice(0, 5);
  for (let i = 0; i < fiveDays.length - 1; i++) {
    const curr = new Date(fiveDays[i]);
    const prev = new Date(fiveDays[i + 1]);
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    // Must be adjacent business days: Mon-Fri diff=1, Mon→Fri diff=3
    const currDay = curr.getDay(); // 1=Mon
    const isMonday = currDay === 1;
    const expectedDiff = isMonday ? 3 : 1;
    if (Math.round(diffDays) !== expectedDiff) return false;
  }
  return true;
}
```

### Anti-Patterns to Avoid

- **Do not add `window.confirm()`**: It is synchronous and blocks the thread; it does not show gate status; it violates the existing UI pattern of inline state management.
- **Do not add a `mode` field to BotTrade**: The schema would require a migration, and all existing trades are implicitly paper trades. The gate check should count all `status='closed'` trades.
- **Do not put gate logic in the route handler**: Extract it to `goLiveGate.ts` so it can be unit-tested independently and reused by both `/gate` and `/mode` endpoints.
- **Do not block the mode switch in signalEngine**: The gate check belongs in the REST route, not the signal pipeline. The signal engine should continue to read `getBotConfig().mode` from in-memory state.
- **Do not remove the open-position guard from switchMode()**: The route's gate check adds gate satisfaction, but the service-layer guard for open positions must remain (defense in depth per INFRA-08).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Consecutive business day logic | Calendar library | Simple arithmetic (day-of-week check + diff) | The requirement is well-bounded: Mon-Fri only, diff=1 except Mon→Fri diff=3. A 10-line function is sufficient and has zero deps. |
| Live API authentication | Custom auth headers | Existing `getAlpacaHeaders()` in tradeExecutor.ts | Already returns the configured key/secret; works for both paper and live. The live API uses identical header names. |
| Mode-switch confirmation | Browser modal library | Inline React state + Tailwind | The project already uses inline state-controlled UI (see the `draft`/`saving` pattern in BotPanel). No modal library exists in the project. |

**Key insight:** Phase 6 is mostly wiring, not new systems. The architecture was designed for this from Phase 1 (see `getAlpacaBaseUrl()` design). The implementation surface is: 1 new service file (`goLiveGate.ts`), 2 new routes in `bot.ts`, and UI additions to `BotPanel.tsx`.

---

## Common Pitfalls

### Pitfall 1: BotTrade Has No Mode Field
**What goes wrong:** Attempting to filter `where: { mode: 'paper' }` in the gate check fails with a TypeScript error — `BotTrade` has no `mode` field in the schema.
**Why it happens:** Mode is tracked in `BotConfig`, not per-trade.
**How to avoid:** Count ALL `status='closed'` BotTrade rows. All trades executed before live mode is ever enabled are paper trades by definition. Document this assumption in a code comment.
**Warning signs:** TypeScript error "`mode` does not exist on type `BotTradeWhereInput`"

### Pitfall 2: "5 Consecutive Days" is Ambiguous
**What goes wrong:** Literal interpretation of "consecutive trading days" could mean calendar days, which would break over weekends.
**Why it happens:** The requirement says "5 consecutive trading days" — trading days skip weekends (and holidays, which the system doesn't track).
**How to avoid:** Use the business-day adjacency check: Mon-Tue-Wed-Thu-Fri consecutive. Weekend bridging: Fri→Mon is 3 calendar days apart. Code the `checkConsecutiveBusinessDays()` helper with this logic.
**Warning signs:** Gate never clears after a weekend even with 5 days of trading.

### Pitfall 3: switchMode() Broadcast Gap
**What goes wrong:** After a mode switch, the frontend BotPanel still shows the old mode because `switchMode()` does not broadcast a `bot_status_update` WebSocket message.
**Why it happens:** `setBotState()` broadcasts, but `switchMode()` only updates the DB and restarts the WebSocket — no WS broadcast.
**How to avoid:** After `switchMode()` succeeds in the route handler, call `broadcast('bot', { type: 'bot_status_update', ... })` OR have the frontend re-fetch `/status` after a successful mode switch response. The simpler approach: after `POST /mode` succeeds, the frontend calls `GET /api/bot/status` to refresh the displayed mode. Document this as the design choice.
**Warning signs:** Mode badge in BotPanel header stays "PAPER" after switching to live.

### Pitfall 4: Gate Check Not Called on Mode Switch
**What goes wrong:** The confirmation dialog shows the gate as passed, user clicks confirm, but the backend `/mode` route doesn't re-check the gate, allowing a race condition.
**Why it happens:** The UI fetches gate status when the dialog opens; time passes; the gate is re-evaluated on the server without re-checking.
**How to avoid:** Always call `evaluateGoLiveGate()` inside the `POST /mode` route handler before calling `switchMode()`. Never trust the client's gate assertion.

### Pitfall 5: Live Alpaca API Credential Differences
**What goes wrong:** Paper and live Alpaca accounts use different API keys. The current system uses `ALPACA_API_KEY` and `ALPACA_API_SECRET` from config — these are the paper credentials.
**Why it happens:** Alpaca provides separate key pairs for paper and live accounts.
**How to avoid:** The system already has `alpacaApiKey` and `alpacaApiSecret` in config. For live trading, the user must update `ALPACA_API_KEY` and `ALPACA_API_SECRET` in `.env` (and `docker-compose.yml` on the VPS) to the live account keys AND change the mode in BotConfig. Both are needed. Document this in the Phase 6 verification checklist.
**Warning signs:** Mode is 'live' but orders still appear in the paper account (because old paper keys are still configured).

### Pitfall 6: Switching from Live Back to Paper
**What goes wrong:** `switchMode('paper')` should not require gate satisfaction (the gate is one-directional: paper→live only). If the gate check is called for paper→paper or live→paper switches, it would incorrectly block paper mode.
**Why it happens:** Forgetting to check directionality in the route handler.
**How to avoid:** Only evaluate the gate when `mode === 'live'` in `POST /mode`.

---

## Code Examples

### Go-Live Gate Service (full pattern)

```typescript
// backend/src/services/goLiveGate.ts
import prisma from '../db/client';

export interface GoLiveGate {
  passed: boolean;
  tradeCount: number;
  tradeCountMet: boolean;
  winRate: number;
  winRateMet: boolean;
  cleanDays: number;
  cleanDaysMet: boolean;
  blockingReason: string | null;
}

const GATE_MIN_TRADES = 30;
const GATE_MIN_WIN_RATE = 0.40;
const GATE_MIN_CLEAN_DAYS = 5;

export async function evaluateGoLiveGate(): Promise<GoLiveGate> {
  // Sub-check 1: trade count
  const allClosed = await prisma.botTrade.findMany({
    where: { status: 'closed' },
    select: { pnl: true },
  });
  const tradeCount = allClosed.length;
  const tradeCountMet = tradeCount >= GATE_MIN_TRADES;

  // Sub-check 2: win rate
  const winners = allClosed.filter(t => (t.pnl ?? 0) > 0).length;
  const winRate = tradeCount > 0 ? winners / tradeCount : 0;
  const winRateMet = winRate >= GATE_MIN_WIN_RATE;

  // Sub-check 3: consecutive clean trading days
  const recentDays = await prisma.botDailyStats.findMany({
    where: { tradeCount: { gt: 0 } },
    orderBy: { date: 'desc' },
    take: 10, // fetch extra to find 5 consecutive
  });
  const cleanDays = countConsecutiveBusinessDays(recentDays.map(d => d.date));
  const cleanDaysMet = cleanDays >= GATE_MIN_CLEAN_DAYS;

  const passed = tradeCountMet && winRateMet && cleanDaysMet;
  let blockingReason: string | null = null;
  if (!tradeCountMet) blockingReason = `Need ${GATE_MIN_TRADES - tradeCount} more completed trades`;
  else if (!winRateMet) blockingReason = `Win rate ${(winRate * 100).toFixed(1)}% below 40% minimum`;
  else if (!cleanDaysMet) blockingReason = `Only ${cleanDays} of 5 required clean trading days`;

  return { passed, tradeCount, tradeCountMet, winRate, winRateMet, cleanDays, cleanDaysMet, blockingReason };
}

function countConsecutiveBusinessDays(sortedDatesDesc: string[]): number {
  if (sortedDatesDesc.length === 0) return 0;

  let count = 1;
  for (let i = 0; i < sortedDatesDesc.length - 1; i++) {
    const curr = new Date(sortedDatesDesc[i] + 'T12:00:00Z');
    const prev = new Date(sortedDatesDesc[i + 1] + 'T12:00:00Z');
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    const currDayOfWeek = curr.getUTCDay(); // 1=Mon
    const expectedDiff = currDayOfWeek === 1 ? 3 : 1; // Mon: prev was Fri (3 days gap), others: 1
    if (diffDays !== expectedDiff) break;
    count++;
    if (count >= 5) break;
  }
  return count;
}
```

### Mode Switch Route

```typescript
// Add to backend/src/routes/bot.ts
import { switchMode } from '../services/botController';
import { evaluateGoLiveGate } from '../services/goLiveGate';

router.post('/mode', requireAuth, async (req, res) => {
  const { mode } = req.body as { mode: string };
  if (mode !== 'paper' && mode !== 'live') {
    res.status(400).json({ error: 'mode must be "paper" or "live"' }); return;
  }
  if (mode === 'live') {
    const gate = await evaluateGoLiveGate();
    if (!gate.passed) {
      res.status(403).json({ error: gate.blockingReason ?? 'Go-live gate not satisfied', gate });
      return;
    }
  }
  try {
    await switchMode(mode as 'paper' | 'live');
    res.json({ mode });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Switch failed' });
  }
});

router.get('/gate', requireAuth, async (_req, res) => {
  try {
    res.json(await evaluateGoLiveGate());
  } catch (err) {
    res.status(500).json({ error: 'Failed to evaluate gate' });
  }
});
```

### Frontend: Status Refresh After Mode Switch

```typescript
// In BotPanel.tsx handleLiveSwitch()
async function handleLiveSwitch() {
  if (!token || !liveGate?.passed) return;
  const res = await fetch('/api/bot/mode', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'live' }),
  });
  if (res.ok) {
    setShowLiveConfirm(false);
    // Re-fetch status to update mode badge
    const s = await fetch('/api/bot/status', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    if (s && !s.error) setStatus(s);
  } else {
    const err = await res.json();
    setSaveError(err.error ?? 'Mode switch failed');
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| window.confirm() for dangerous actions | Inline React confirmation panel | Industry shift to React | window.confirm() breaks in many contexts (iframes, some browsers); inline state is more controllable |
| Alpaca v1 API | Alpaca v2 API | 2021 | All existing code already uses v2; no change needed |

**Deprecated/outdated:**
- The legacy `paperTradingEnabled` flag in `config.ts` is from before the bot system; it controls the old `paperTrader.ts` (manual paper trades), not the autonomous bot. Phase 6 does not touch this flag.

---

## Open Questions

1. **Live API key management**
   - What we know: The current `ALPACA_API_KEY` and `ALPACA_API_SECRET` are paper credentials. Live trading requires the user to replace these with live account keys before switching mode.
   - What's unclear: Should Phase 6 add a `ALPACA_LIVE_API_KEY`/`ALPACA_LIVE_API_SECRET` separate from the paper credentials? Or does the user simply swap the existing credentials?
   - Recommendation: Keep the current single-key-pair design. The user must manually update the credentials before activating live mode. Document this in the verification checklist. Adding parallel key config would require schema changes and is out of scope for v1. The system already has `alpacaLiveUrl` in config as a static constant — no runtime config needed for the URL.

2. **"Unhandled exception" definition for clean days**
   - What we know: The requirement says "no unhandled exceptions." The current DB has no exception log table. `BotDailyStats` has `tradeCount` per day.
   - What's unclear: How to detect exception days programmatically without a log table.
   - Recommendation: Interpret "clean day" as "a day present in `BotDailyStats` with `tradeCount > 0`." Document this interpretation explicitly. If the server crashed uncleanly, the daily reset would not have run for that day's counts — but this is an imperfect signal. An unhandled exception that crashed the server mid-day would still show whatever count was accumulated before the crash. Acceptable for v1.

3. **Should live mode be reversible without a gate re-check?**
   - What we know: The user may want to switch back to paper mode during live trading (e.g., to test changes). `switchMode('paper')` should not require gate re-check.
   - What's unclear: Should switching back to live after going paper require a new gate check?
   - Recommendation: Gate check is required for EVERY switch TO live mode, regardless of history. This is the safest interpretation of the requirement. Document this.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bash shell checks (project convention — see `phase05-checks.sh`) |
| Config file | none — inline bash |
| Quick run command | `bash .planning/phases/06-live-trading-mode/phase06-checks.sh` |
| Full suite command | same |

No vitest or jest infrastructure exists in the project. All prior phases used grep-based bash scripts. Phase 6 follows the same pattern.

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIVE-01 | `getAlpacaBaseUrl()` returns live URL when mode='live' | grep | `grep -q "alpacaLiveUrl" backend/src/services/botController.ts` | Already exists |
| LIVE-01 | `POST /api/bot/mode` route exists | grep | `grep -q "router.post('/mode'" backend/src/routes/bot.ts` | Wave 0 gap |
| LIVE-01 | `switchMode` imported in `bot.ts` | grep | `grep -q "switchMode" backend/src/routes/bot.ts` | Wave 0 gap |
| LIVE-02 | `POST /mode` gate check before live | grep | `grep -q "evaluateGoLiveGate" backend/src/routes/bot.ts` | Wave 0 gap |
| LIVE-02 | `showLiveConfirm` state in BotPanel | grep | `grep -q "showLiveConfirm" frontend/src/components/panels/BotPanel.tsx` | Wave 0 gap |
| LIVE-02 | Confirmation dialog exists | grep | `grep -q "CONFIRM LIVE\|SWITCH TO LIVE" frontend/src/components/panels/BotPanel.tsx` | Wave 0 gap |
| LIVE-03 | `goLiveGate.ts` service file exists | file | `test -f backend/src/services/goLiveGate.ts` | Wave 0 gap |
| LIVE-03 | `GET /gate` route exists | grep | `grep -q "router.get('/gate'" backend/src/routes/bot.ts` | Wave 0 gap |
| LIVE-03 | Gate checks trade count | grep | `grep -q "tradeCount\|GATE_MIN_TRADES" backend/src/services/goLiveGate.ts` | Wave 0 gap |
| LIVE-03 | Gate checks win rate | grep | `grep -q "winRate\|GATE_MIN_WIN_RATE" backend/src/services/goLiveGate.ts` | Wave 0 gap |
| LIVE-03 | Gate checks clean days | grep | `grep -q "cleanDays\|GATE_MIN_CLEAN_DAYS" backend/src/services/goLiveGate.ts` | Wave 0 gap |
| LIVE-03 | Gate status displayed in UI | grep | `grep -q "liveGate\|GoLiveGate" frontend/src/components/panels/BotPanel.tsx` | Wave 0 gap |
| tsc | Backend TypeScript clean | tsc | `cd backend && npx tsc --noEmit` | Continuous |
| tsc | Frontend TypeScript clean | tsc | `cd frontend && npx tsc --noEmit` | Continuous |

### Wave 0 Gaps (files to create)

- [ ] `backend/src/services/goLiveGate.ts` — covers LIVE-03 gate logic
- [ ] `POST /mode` route in `backend/src/routes/bot.ts` — covers LIVE-01/LIVE-02
- [ ] `GET /gate` route in `backend/src/routes/bot.ts` — covers LIVE-03 UI
- [ ] `showLiveConfirm` + gate display in `frontend/src/components/panels/BotPanel.tsx` — covers LIVE-02/LIVE-03
- [ ] `phase06-checks.sh` — covers all automated verification

*(No new test framework install needed — bash scripts match project convention)*

---

## Proposed Plan Structure (3 plans)

| Plan | Content | Type |
|------|---------|------|
| 06-01 | `goLiveGate.ts` service + `POST /mode` + `GET /gate` routes in `bot.ts` | backend |
| 06-02 | `BotPanel.tsx` — gate display + confirmation dialog + mode switch call | frontend |
| 06-03 | `phase06-checks.sh` automated verification suite + human checkpoint | verification |

This is lean (3 plans vs 4-5 in prior phases) because Phase 6 is primarily wiring on top of already-complete infrastructure. The backend work (Plan 1) and frontend work (Plan 2) can run in parallel (Wave 2 in Wave-based execution), with verification last.

---

## Sources

### Primary (HIGH confidence)

- `C:/Projects/StockNews/backend/src/services/botController.ts` — confirmed `getAlpacaBaseUrl()` and `switchMode()` implementation
- `C:/Projects/StockNews/backend/src/config.ts` — confirmed `alpacaPaperUrl` and `alpacaLiveUrl` constants
- `C:/Projects/StockNews/backend/src/routes/bot.ts` — confirmed no `/mode` or `/gate` routes exist
- `C:/Projects/StockNews/backend/src/services/tradingWs.ts` — confirmed URL derivation from `getAlpacaBaseUrl()`
- `C:/Projects/StockNews/backend/prisma/schema.prisma` — confirmed `BotTrade`, `BotDailyStats`, `BotConfig` schemas (no `mode` field on `BotTrade`)
- `C:/Projects/StockNews/frontend/src/components/panels/BotPanel.tsx` — confirmed no mode-switch controls, mode display exists in header

### Secondary (MEDIUM confidence)

- Alpaca Markets docs (from prior phases' research): paper→live is one URL change (`paper-api.alpaca.markets` → `api.alpaca.markets`); live account requires live API key pair
- Project `MEMORY.md`: "Paper→live is ONE config change: `paper-api.alpaca.markets` → `api.alpaca.markets`" — confirmed by code inspection

### Tertiary (LOW confidence)

- "Unhandled exception" detection via `BotDailyStats` row presence is an interpretation — no official definition in requirements. Flagged for planning decision.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; verified in codebase
- Architecture: HIGH — service + route + UI pattern follows established project conventions exactly
- Pitfalls: HIGH for code-level pitfalls (verified against schema); MEDIUM for "consecutive clean days" interpretation (design decision, not verifiable from code alone)
- Gate logic: HIGH for trade count + win rate (direct DB queries); MEDIUM for clean days (interpretation of "unhandled exceptions")

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable domain; only risk is Alpaca API changes)
