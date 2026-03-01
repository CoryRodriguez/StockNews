# Phase 4: Risk Management Enforcement - Research

**Researched:** 2026-02-28
**Domain:** Node.js trading bot risk gates — concurrent position limits, PDT enforcement, trailing stop, daily counter reset
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Daily Loss Circuit Breaker (RISK-01) — REMOVED**
- No daily P&L circuit breaker. User's risk management approach is: enter on the correct news as quickly as possible, then let tight exit logic (trailing stop + hard stop) protect the position.
- Planner should NOT implement a daily loss limit or related circuit breaker logic.

**Max Concurrent Positions (RISK-02)**
- Configurable via BotConfig (e.g., `maxConcurrentPositions`)
- No hardcoded default — value depends on how many high-confidence catalysts fire per day
- When open positions >= limit, new buy signals are rejected and logged

**PDT Enforcement (RISK-03)**
- Paper mode: Account will be funded >$25k — PDT rule does not apply. No PDT check in paper mode.
- Live mode: Check Alpaca's `daytrade_count` before placing each buy order. If placing the trade would bring the count to 4+ in a 5-day window, block and log as "PDT limit reached".
- PDT enforcement is live-mode only.

**4AM Daily Reset (RISK-04)**
- Resets: daily trade count (for analytics/tracking)
- Clears any in-memory daily state
- No circuit breaker reset (RISK-01 is removed)
- Implemented via node-cron at 4:00 AM ET

**Per-Symbol Concentration (RISK-05)**
- One position per ticker at a time
- If bot already holds AAPL and a new AAPL catalyst fires → reject the signal, log as "already holding {ticker}"
- Rationale: if we're already in the trade, we caught it on the original news — a second article is not a new entry opportunity

**Trailing Stop (EXIT-02)**
- Both `trailingStopPct` (percentage from peak) and `trailingStopDollar` (fixed dollar from peak) configurable in BotConfig
- Runs simultaneously with existing hard stop loss — two independent exit triggers
- Hard stop = immediate floor for fast crashes; trailing stop = locks in gains as price rises

**Rejected Trade Logging**
- Rejected signals recorded in the same trades table as executed trades, with `status = 'rejected'`
- Record must include: rejection reason (which rule fired), symbol, signal timestamp
- Include associated news article reference when the rejection is signal-based
- For technical errors/glitches: record error details for debugging — do not silently swallow

### Claude's Discretion
- When both `trailingStopPct` and `trailingStopDollar` are configured, percentage takes precedence
- Exact Prisma schema fields for rejected trade records
- How trailing stop integrates with existing paperTrader.ts peak price tracking from Phase 3

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RISK-01 | (REMOVED per CONTEXT.md) Bot halts all new trade entries when cumulative realized P&L falls below daily loss limit | REMOVED — do not implement |
| RISK-02 | Bot rejects new trade entries when open positions >= configured maximum | Max concurrent check in signalEngine.ts before executeTradeAsync; openPositions Map in positionMonitor.ts is the source of truth |
| RISK-03 | Bot checks Alpaca daytrade_count before every live buy; blocks if it would exceed 3 in 5-day window | Alpaca GET /v2/account returns daytrade_count as integer; live-mode only check in executeTradeAsync |
| RISK-04 | Bot resets daily statistics at 4:00 AM ET each trading day via scheduled job | node-cron already installed and used; schedule '0 4 * * 1-5' with America/New_York timezone |
| RISK-05 | Bot enforces per-ticker cooldown — no new entry in symbol with open position | Already partially implemented in executeTradeAsync as hasOpenPosition(); needs to log rejection to BotSignalLog |
| EXIT-02 | Bot applies trailing stop loss that trails peak price; configurable via BotConfig | peakPrice tracking already in positionMonitor.ts TrackedPosition; needs trailingStopPct + trailingStopDollar fields in BotConfig + schema |
</phase_requirements>

---

## Summary

Phase 4 adds risk guardrails to a Node.js trading bot that already has working order placement (Phase 3 complete). The infrastructure is deeply familiar: the codebase uses TypeScript, Prisma, PostgreSQL, node-cron, and the Alpaca REST API. All three core files that need modification are well-understood from earlier phases — `signalEngine.ts` (evaluation gauntlet), `executeTradeAsync` in `tradeExecutor.ts` (buy-side logic), and `positionMonitor.ts` (exit loop). The codebase pattern is consistent: guards reject at the earliest possible step, write a log record, and return.

The two new BotConfig fields (`trailingStopPct`, `trailingStopDollar`) require a schema migration (pattern already established across 3 prior migrations). RISK-05 (per-symbol concentration) is already 90% done in `tradeExecutor.ts` as a silent skip — Phase 4 upgrades it to a logged rejection in `BotSignalLog`. The 4AM daily reset (RISK-04) adds a second node-cron job alongside the existing 3:45 PM EOD close job. PDT enforcement (RISK-03) is the only part requiring an external API call (`GET /v2/account`) before each live-mode buy.

The trailing stop (EXIT-02) is the most substantial change: it wires `peakPrice` (tracked but unused in Phase 3) into actual exit logic in `positionMonitor.ts`. The logic is: when `currentPrice < peakPrice * (1 - trailingStopPct/100)`, close the position with `exitReason = 'trailing_stop'`. When both `trailingStopPct` and `trailingStopDollar` are set, percentage takes precedence (Claude's discretion per CONTEXT.md).

**Primary recommendation:** Implement in 3 plans — (1) schema migration + BotConfig fields, (2) risk gates in signalEngine + executeTradeAsync, (3) trailing stop in positionMonitor + 4AM reset cron. This matches the established phase cadence.

---

## Standard Stack

### Core (all already installed — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node-cron | ^3.0.11 | Scheduled jobs (4AM reset) | Already installed, proven with EOD cron in positionMonitor.ts |
| @prisma/client | (existing) | DB access for BotConfig, BotDailyStats, BotSignalLog | Established ORM for all bot tables |
| TypeScript | (existing) | Type safety for risk gate logic | Project-wide language |

### No New Dependencies Required
Phase 4 introduces zero new npm packages. All required capabilities (scheduling, DB access, Alpaca REST calls) are already in the project.

**Installation:**
```bash
# No new packages — all dependencies already installed
```

---

## Architecture Patterns

### Recommended File Structure for Phase 4 Changes

```
backend/src/
├── services/
│   ├── signalEngine.ts       # ADD: RISK-02 max-concurrent check (Step 9.5)
│   │                         # ADD: RISK-05 upgrade silent skip → logged rejection
│   ├── tradeExecutor.ts      # ADD: RISK-03 PDT check before placeNotionalBuyOrder()
│   │                         # ADD: RISK-05 write BotSignalLog on duplicate position
│   ├── positionMonitor.ts    # ADD: EXIT-02 trailing stop in checkExitConditions()
│   │                         # ADD: RISK-04 4AM daily reset cron
│   └── botController.ts      # UPDATE: BotConfigRecord interface (new fields)
│
├── routes/
│   └── bot.ts                # UPDATE: /status to expose dayTradeCount if needed
│
└── config.ts                 # No changes needed
│
backend/prisma/
├── schema.prisma             # ADD: trailingStopPct, trailingStopDollar to BotConfig
└── migrations/
    └── 20260228000003_add_trailing_stop_fields/migration.sql  # NEW migration
```

### Pattern 1: Risk Gate Added to Signal Engine (RISK-02)

The signal gauntlet in `signalEngine.ts` already has 10+ steps rejecting signals. Phase 4 adds a step that checks concurrent open positions against `maxConcurrentPositions`. Insert this check after the existing 5-Pillars check (step 10) and before firing the trade executor (step 11).

**What:** Count open positions from positionMonitor's in-memory map (fast, no DB query needed)
**When to use:** Every signal evaluation that would otherwise fire
**Example:**
```typescript
// Source: signalEngine.ts — insert before step 11 (tier branch)
// Import at top: import { getOpenPositionCount } from './positionMonitor';

const cfg = getBotConfig();
const openCount = getOpenPositionCount();  // new export from positionMonitor
if (openCount >= cfg.maxConcurrentPositions) {
  await writeSignalLog({
    symbol,
    source: article.source,
    headline: article.title,
    catalystCategory: classification.category,
    catalystTier: classification.tier,
    outcome: 'rejected',
    rejectReason: 'max-positions',
    // ... other fields null
    articleCreatedAt: new Date(article.createdAt),
  });
  return;
}
```

### Pattern 2: PDT Check Before Live Buy (RISK-03)

In `executeTradeAsync()`, before calling `placeNotionalBuyOrder()`, check Alpaca account's `daytrade_count` when in live mode. Paper mode skips this check entirely (account is >$25k, PDT doesn't apply).

**Alpaca endpoint:** `GET /v2/account`
**Field:** `daytrade_count` (integer) — "current number of daytrades in the last 5 trading days, inclusive of today"
**PDT threshold:** Block if `daytrade_count >= 3` (placing the trade would bring it to 4+, triggering PDT)

```typescript
// Source: Alpaca API reference /reference/getaccount-1
// Insert in executeTradeAsync(), before placeNotionalBuyOrder()

async function checkPdtLimit(): Promise<boolean> {
  const botCfg = getBotConfig();
  if (botCfg.mode !== 'live') return false; // PDT only applies in live mode

  try {
    const res = await fetch(`${getAlpacaBaseUrl()}/v2/account`, {
      headers: getAlpacaHeaders(),
    });
    if (!res.ok) {
      console.warn(`[TradeExecutor] PDT check: account fetch failed (${res.status}) — allowing trade`);
      return false; // fail open: don't block on API errors
    }
    const account = await res.json() as { daytrade_count: number };
    return account.daytrade_count >= 3;
  } catch (err) {
    console.warn('[TradeExecutor] PDT check error — allowing trade:', err);
    return false; // fail open
  }
}

// In executeTradeAsync():
if (await checkPdtLimit()) {
  console.warn(`[TradeExecutor] PDT limit reached for ${symbol} — blocked`);
  // Write to BotTrade with status='rejected', exitReason='pdt_limit'
  await prisma.botTrade.create({
    data: {
      symbol,
      status: 'rejected',
      exitReason: 'pdt_limit',
      catalystType: catalystCategory,
      catalystTier,
      entryAt: new Date(),
    },
  });
  return;
}
```

### Pattern 3: Trailing Stop in checkExitConditions (EXIT-02)

`positionMonitor.ts` already tracks `peakPrice` on every poll cycle but has a placeholder comment "DEFERRED TO PHASE 4". Phase 4 removes the placeholder and wires actual exit logic.

**Precedence rule (Claude's discretion per CONTEXT.md):** trailingStopPct takes precedence over trailingStopDollar when both are set.

```typescript
// Source: positionMonitor.ts — replaces the "EXIT-02: Trailing stop — DEFERRED" comment
// in checkExitConditions()

// EXIT-02: Trailing stop — fires if price falls X% or $Y below peak
const trailPct   = cfg.trailingStopPct;    // new BotConfig field
const trailDollar = cfg.trailingStopDollar; // new BotConfig field

if (trailPct > 0) {
  // Percentage trailing stop takes precedence
  const stopPrice = pos.peakPrice * (1 - trailPct / 100);
  if (currentPrice <= stopPrice) {
    await closePosition(pos, currentPrice, 'trailing_stop');
    return;
  }
} else if (trailDollar > 0) {
  // Dollar trailing stop only when pct is not set (0)
  const stopPrice = pos.peakPrice - trailDollar;
  if (currentPrice <= stopPrice) {
    await closePosition(pos, currentPrice, 'trailing_stop');
    return;
  }
}
```

### Pattern 4: 4AM Daily Reset Cron (RISK-04)

Add a second `cron.schedule()` call in `positionMonitor.ts` alongside the existing 3:45 PM EOD cron. Reset: clear in-memory daily counters + upsert `BotDailyStats` for the new day. The `BotDailyStats` table already exists with `tradeCount`, `dayTradeCount`, `realizedPnl` — the reset does NOT delete old rows, just ensures today's row starts at zero.

```typescript
// Source: positionMonitor.ts — add inside scheduleEodForceClose() or a new function
cron.schedule('0 4 * * 1-5', async () => {
  console.log('[PositionMonitor] 4AM daily reset — clearing in-memory daily state');
  // No circuit breaker to clear (RISK-01 removed)
  // BotDailyStats row for today will be created fresh on first trade of the day
  // via upsert in closePosition/onFillEvent
  console.log('[PositionMonitor] Daily reset complete');
}, { timezone: 'America/New_York' });
```

### Pattern 5: Schema Migration (new BotConfig fields for EXIT-02)

Follow the established migration pattern from `20260228000002_add_bot_config_sizing_fields`:

```sql
-- 20260228000003_add_trailing_stop_fields/migration.sql
ALTER TABLE "BotConfig" ADD COLUMN IF NOT EXISTS "trailingStopPct"    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "BotConfig" ADD COLUMN IF NOT EXISTS "trailingStopDollar" DOUBLE PRECISION NOT NULL DEFAULT 0;
```

Default 0 means "disabled" — trailing stop only fires when the value is > 0. This preserves existing behavior for rows with no trailing stop configured.

### Anti-Patterns to Avoid

- **Checking concurrent positions via DB query in signal engine:** The in-memory `openPositions` Map in `positionMonitor.ts` is the source of truth. Export `getOpenPositionCount()` — it's O(1) and never blocks.
- **Blocking on PDT check failure:** The PDT API call can fail (Alpaca unreachable, timeout). Fail open — log a warning and allow the trade. Never block a trade indefinitely on API unreachability.
- **Setting trailingStopDollar default to non-zero:** Default 0 means disabled. If both fields are non-zero, percentage wins. This is unambiguous.
- **Deleting BotDailyStats rows at 4AM:** Don't delete old rows — they're historical data. Just ensure today's row is upserted to 0 when the first trade of the day fires.
- **Writing rejected BotTrade rows for RISK-02/RISK-05 in executeTradeAsync vs signalEngine:** RISK-02 and RISK-05 rejections should be logged in `BotSignalLog` (signalEngine) not as BotTrade rows. PDT rejections (RISK-03) are the exception — they happen post-signal and should be BotTrade rows with `status='rejected'`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheduled daily reset | Custom setTimeout loop | node-cron (already installed) | DST-safe, survives timer drift, idiomatic — EOD cron already uses it |
| PDT state tracking | Custom counter in memory | Alpaca GET /v2/account `daytrade_count` | Alpaca is the authoritative source; in-memory counter would drift on restart |
| Concurrent position count | DB count query per evaluation | positionMonitor openPositions.size | In-memory map is O(1) and already maintained |
| Timezone-correct scheduling | Manual UTC offset math | node-cron `{ timezone: 'America/New_York' }` | DST transitions handled automatically — proven pattern in Phase 3 EOD cron |

**Key insight:** Every problem in this phase has an existing hook in the codebase. Phase 4 is wiring + configuring, not building new infrastructure.

---

## Common Pitfalls

### Pitfall 1: RISK-05 — Duplicate Position Check Already Exists But Is Silent
**What goes wrong:** `hasOpenPosition()` in `tradeExecutor.ts` is already called at step 2 of `executeTradeAsync()`. However, it does a silent skip with no DB write. CONTEXT.md requires logging a `BotSignalLog` record with `rejectReason = 'already-holding'`.
**Why it happens:** Phase 3 implemented the guard for correctness but deferred logging to Phase 4.
**How to avoid:** The RISK-05 check should be in `signalEngine.ts` (before `executeTradeAsync` is called), not in `tradeExecutor.ts`. This way the `BotSignalLog` record can be written with article context (headline, source, catalystCategory). Alternatively, upgrade the silent skip in `executeTradeAsync` to also write a BotSignalLog — but the signal engine is the better place because it has the article context.
**Warning signs:** Signals for already-held symbols show no `BotSignalLog` record at all (invisible gaps in audit log).

### Pitfall 2: PDT Check — Fail Open, Not Fail Closed
**What goes wrong:** Making the PDT check fatal (throw on API error, or return "blocked" on any failure).
**Why it happens:** Defensive coding impulse.
**How to avoid:** `checkPdtLimit()` must return `false` (allow trade) on any API error, timeout, or non-200 response. Log a warning. The Alpaca API can be unavailable pre-market, during maintenance, etc. Blocking trades indefinitely on API unreachability defeats the purpose of the bot.
**Warning signs:** All trades blocked during Alpaca maintenance windows.

### Pitfall 3: Trailing Stop Fires Before Hard Stop on Large Gap-Down
**What goes wrong:** If `trailingStopPct = 3%` and `hardStopLossPct = 7%`, a fast 7% crash triggers both conditions simultaneously in the same poll cycle. The order of checks in `checkExitConditions()` matters.
**Why it happens:** Both conditions become true at the same price.
**How to avoid:** Hard stop loss (EXIT-01) must be checked BEFORE trailing stop (EXIT-02) in `checkExitConditions()`. The hard stop provides an absolute floor — it doesn't matter which "kind" of stop fires. Current code already has EXIT-01 first; EXIT-02 goes after EXIT-01 and before EXIT-03.
**Warning signs:** Double-sell attempts (prevented by the `pos.sold` guard, but the order of checks affects which `exitReason` gets logged).

### Pitfall 4: peakPrice Reset on Reconciliation
**What goes wrong:** On server restart, `reconcilePositions()` in `botController.ts` calls `addPosition()` with `peakPrice: trade.entryPrice ?? 0`. If a position has been running for 30 minutes with a +10% peak, the trailing stop starts tracking from entry (0% peak) rather than the actual peak.
**Why it happens:** We don't persist `peakPrice` in the DB — it's only in the in-memory `TrackedPosition`.
**How to avoid:** Accept this limitation — it's a known restart trade-off. After restart, the trailing stop will trail from entry price (conservative). The hard stop still protects. Do NOT add peakPrice to the BotTrade DB schema in Phase 4 — that's scope creep. Document this behavior in code comments.
**Warning signs:** After restart, trailing stop fires immediately on a position that had a large peak-then-pullback.

### Pitfall 5: 4AM Cron and EOD Cron Collision on Scheduling
**What goes wrong:** `startPositionMonitor()` currently calls `scheduleEodForceClose()`. Adding the 4AM cron to the same function could cause issues if `startPositionMonitor()` is called multiple times (e.g., in tests or re-initializations).
**Why it happens:** `cron.schedule()` is called at module level or on function call — multiple calls create duplicate jobs.
**How to avoid:** Schedule both crons inside a single init function that is called exactly once at startup. Or add a guard: track whether crons are already scheduled with a module-level boolean flag.

### Pitfall 6: RISK-02 Check Timing (Signal Engine vs Executor)
**What goes wrong:** Checking `openPositions.size >= maxConcurrentPositions` in `executeTradeAsync()` (too late — after signal is already "fired" in BotSignalLog). The audit log would show `outcome: 'fired'` but no trade placed.
**Why it happens:** Reflex to put all buy-side guards in the executor.
**How to avoid:** RISK-02 check goes in `signalEngine.ts` at the point before the signal log entry with `outcome: 'fired'` is written. This way the audit log shows `outcome: 'rejected', rejectReason: 'max-positions'` — accurate and debuggable.

---

## Code Examples

Verified patterns from codebase and official sources:

### Reading Alpaca Account (PDT check)
```typescript
// Source: Alpaca API reference — GET /v2/account
// daytrade_count is integer in response
interface AlpacaAccount {
  daytrade_count: number;
  pattern_day_trader: boolean;
  buying_power: string;
  // ... other fields
}

const res = await fetch(`${getAlpacaBaseUrl()}/v2/account`, {
  headers: {
    'APCA-API-Key-ID': config.alpacaApiKey,
    'APCA-API-Secret-Key': config.alpacaApiSecret,
  },
});
const account = await res.json() as AlpacaAccount;
// PDT block condition: daytrade_count >= 3 means the next trade would be the 4th
const pdtLimitReached = account.daytrade_count >= 3;
```

### node-cron 4AM ET Reset
```typescript
// Source: existing positionMonitor.ts pattern — node-cron ^3.0.11
// The 3:45 PM EOD cron uses: cron.schedule('45 15 * * 1-5', handler, { timezone: 'America/New_York' })
// 4AM reset follows the same pattern:
cron.schedule('0 4 * * 1-5', async () => {
  console.log('[PositionMonitor] 4AM daily reset');
  // Reset in-memory daily state if any
}, { timezone: 'America/New_York' });
```

### Exporting Position Count from positionMonitor.ts
```typescript
// Source: positionMonitor.ts openPositions Map (module-level)
/**
 * Returns the count of currently tracked open positions.
 * Used by signalEngine.ts to enforce RISK-02 max concurrent positions.
 * O(1) — reads in-memory Map size.
 */
export function getOpenPositionCount(): number {
  return openPositions.size;
}
```

### Trailing Stop Logic (EXIT-02)
```typescript
// Source: positionMonitor.ts checkExitConditions() — replaces placeholder comment
// After EXIT-01 check, before EXIT-03 check:

// EXIT-02: Trailing stop (runs simultaneously with hard stop)
const trailPct    = cfg.trailingStopPct;    // 0 = disabled
const trailDollar = cfg.trailingStopDollar; // 0 = disabled

if (trailPct > 0) {
  // Percentage takes precedence (Claude's discretion per CONTEXT.md)
  if (currentPrice <= pos.peakPrice * (1 - trailPct / 100)) {
    await closePosition(pos, currentPrice, 'trailing_stop');
    return;
  }
} else if (trailDollar > 0) {
  if (currentPrice <= pos.peakPrice - trailDollar) {
    await closePosition(pos, currentPrice, 'trailing_stop');
    return;
  }
}
```

### BotDailyStats Upsert (for trade count tracking)
```typescript
// Source: prisma/schema.prisma — BotDailyStats model
// Pattern: upsert on first use each day; RISK-04 reset doesn't delete rows
const todayET = getTodayDateET(); // from botController.ts

await prisma.botDailyStats.upsert({
  where: { date: todayET },
  update: { tradeCount: { increment: 1 } },
  create: { date: todayET, tradeCount: 1, dayTradeCount: 0, realizedPnl: 0 },
});
```

### Rejected Trade Log for RISK-02 / RISK-05 in signalEngine
```typescript
// Same writeSignalLog() pattern used throughout signalEngine.ts
await writeSignalLog({
  symbol,
  source: article.source,
  headline: article.title,
  catalystCategory: classification.category,
  catalystTier: classification.tier,
  outcome: 'rejected',
  rejectReason: 'max-positions',      // or 'already-holding' for RISK-05
  failedPillar: null,
  aiProceed: null,
  aiConfidence: null,
  aiReasoning: null,
  winRateAtEval,
  priceAtEval: snap.price,
  relVolAtEval: snap.relativeVolume,
  articleCreatedAt: new Date(article.createdAt),
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| peakPrice tracked but unused (Phase 3 placeholder) | peakPrice actively drives trailing stop exit | Phase 4 | EXIT-02 fully implemented |
| RISK-05 silent skip in executeTradeAsync | RISK-05 logged rejection in signalEngine BotSignalLog | Phase 4 | Audit log shows all "already holding" rejections |
| PDT check absent | PDT check on every live-mode buy | Phase 4 | Live account protection (RISK-03) |
| No concurrent position enforcement | maxConcurrentPositions enforced at signal evaluation | Phase 4 | RISK-02 enforcement with logged rejection |

**Deprecated/outdated:**
- The "DEFERRED TO PHASE 4" placeholder comment in `positionMonitor.ts` at the EXIT-02 location — remove and replace with real logic.
- The silent-return behavior in `executeTradeAsync` for `hasOpenPosition()` — this remains, but RISK-05 logging moves upstream to signalEngine so the audit log is complete.

---

## Open Questions

1. **Should BotDailyStats.tradeCount be incremented on every successful buy or on every close?**
   - What we know: The table has both `tradeCount` and `dayTradeCount`. `tradeCount` is for analytics tracking. `dayTradeCount` mirrors Alpaca's count for debugging.
   - What's unclear: The CONTEXT.md says the 4AM reset clears "daily trade count" — does this mean zeroing the in-memory counter, or upserting a fresh DB row?
   - Recommendation: The 4AM reset simply logs that a new day has begun. The first trade of the new day creates a fresh `BotDailyStats` row via upsert (new date string). No zeroing of old rows needed. The counter is implicit in the date-keyed rows.

2. **Should dayTradeCount in BotDailyStats be updated from Alpaca's count or tracked locally?**
   - What we know: Alpaca's `daytrade_count` is authoritative. Local tracking would drift on restart.
   - What's unclear: Whether the bot should sync `dayTradeCount` from Alpaca at startup (in `reconcilePositions()`).
   - Recommendation: For Phase 4, read Alpaca's count fresh on each live buy (RISK-03 check). Don't maintain a local shadow counter — it adds complexity and drift risk. `BotDailyStats.dayTradeCount` can be updated each time a live-mode trade is placed (increment after the Alpaca check confirms it's below the limit).

3. **Where exactly does RISK-05 logging belong — signalEngine or tradeExecutor?**
   - What we know: The `hasOpenPosition()` guard is in `tradeExecutor.ts` (step 2). The article context (headline, source, catalystCategory) is available only in `signalEngine.ts`.
   - What's unclear: Whether to duplicate the check in signalEngine, or pass article context into the executor.
   - Recommendation: Move RISK-05 check to `signalEngine.ts` (add after step 10, before step 11 tier branch). The check in `tradeExecutor.ts` remains as a safety net but stays silent. This gives the audit log full context without changing the executor's interface.

---

## Key Architecture Context (What Phase 4 Modifies)

### Existing Signal Gauntlet (signalEngine.ts)
The current 10-step evaluation pipeline:
1. Bot running check (silent skip)
2. Market open check (silent skip)
3. Reconnect cooldown → reject "reconnect-cooldown"
4. Staleness check → reject "stale"
5. Dedup check (silent skip)
6. Catalyst classification → reject "danger-pattern" or "tier-disabled"
7. Enabled tier gate → reject "tier-disabled"
8. Opening auction window → reject "opening-auction"
9. Strategy win-rate gate → reject "below-win-rate"
10. 5 Pillars check → reject "failed-5-pillars"
11. Tier branch → fire trade or AI evaluate

**Phase 4 inserts between step 10 and step 11:**
- 10.5: Max concurrent positions check (RISK-02) → reject "max-positions"
- 10.6: Already-holding check (RISK-05) → reject "already-holding"

### Existing positionMonitor.ts checkExitConditions() Order
Current order (must be preserved):
1. EXIT-01: Hard stop loss
2. EXIT-03: Profit target
3. EXIT-04: Max hold time
4. EXIT-02: PLACEHOLDER (add trailing stop here in Phase 4)

**Phase 4 adds EXIT-02 between EXIT-01 and EXIT-03.** This ensures hard stop takes precedence (absolute floor), then trailing stop (dynamic protection), then profit target.

### BotConfigRecord Interface Must Stay in Sync
`botController.ts` exports `BotConfigRecord` interface that mirrors the Prisma schema. Any new fields in `schema.prisma` BotConfig must also be added to this interface in the same commit. Failure to update the interface causes TypeScript drift (compiles, but runtime accesses are untyped). This was an explicit lesson from Phase 3.

---

## Sources

### Primary (HIGH confidence)
- Codebase (read directly): `signalEngine.ts`, `positionMonitor.ts`, `tradeExecutor.ts`, `botController.ts`, `schema.prisma`, `index.ts`, `routes/bot.ts`, `config.ts`
- Alpaca API reference (WebFetch): `GET /v2/account` — confirmed `daytrade_count` field is integer, `pattern_day_trader` is boolean
- All prior migration SQL files — confirmed migration naming and SQL pattern

### Secondary (MEDIUM confidence)
- Alpaca GET /v2/positions working-with-positions doc (WebFetch): confirmed Position object structure and field names
- WebSearch "Alpaca daytrade_count" — confirmed field is in account endpoint (not positions endpoint)

### Tertiary (LOW confidence)
- None — all critical claims verified from official docs or direct codebase reads

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, zero new dependencies needed
- Architecture: HIGH — all 5 modification points read directly from codebase
- Pitfalls: HIGH — derived from direct code inspection of the placeholder comments and existing guard patterns
- Alpaca API field names: HIGH — confirmed via official reference endpoint

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stable codebase + stable Alpaca API; Alpaca API fields are stable long-term)
