# Phase 1: Bot Infrastructure Foundation - Research

**Researched:** 2026-02-27
**Domain:** Prisma schema migrations, TypeScript singleton services, Express REST lifecycle, Alpaca positions API
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**DB Schema — BotConfig**
- Store ALL configurable fields in Phase 1: enabled flag, paper/live mode, position size (USD), confidence multipliers (high/med/low), max concurrent positions, daily loss limit, min win rate threshold, hard stop loss %, max hold duration, catalyst tier enablement, 5 Pillars thresholds (max float, max price, min relative volume)
- Reason: avoids schema migrations when later phases need to read these values; they can just read from BotConfig immediately

**DB Schema — BotTrade**
- Define the full schema now, even though Phase 1 won't insert records: symbol, entry price, exit price, shares, P&L, catalyst type, catalyst tier, exit reason, status (open/closed/missed), Alpaca order ID, timestamps (entry, exit, created)
- Trade recording starts when paper trading begins (Phase 3)
- Purpose of capturing all fields now: accumulate data to analyze which catalyst keywords/tiers produce profitable trades and which exit signals work — this data feeds the strategy engine

**DB Schema — BotDailyStats**
- Tracks daily P&L, trade count, day trade count per calendar date
- Used by circuit breakers and PDT guard in Phase 4

**Lifecycle State Machine**
- States: `stopped`, `running`, `paused`
- **Pause semantics**: no new buy signals, but continue monitoring and exiting open positions — positions are never left unattended when paused
- **Stop semantics**: halt all activity (no new buys, no position monitoring)
- On server restart: restore last known state from BotConfig — if it was running before restart, it resumes running; if stopped, stays stopped

**Startup Reconciliation**
- On every server startup, compare DB open positions against Alpaca's live position endpoint
- If a DB position no longer exists at Alpaca: mark it as status = `missed` with a reconciliation note — preserve the data for analysis rather than deleting
- No frontend alert for reconciled-missing positions
- Bot is a server-side background process; runs independently of whether the browser/frontend is open

**REST API Shape**
- Individual action endpoints: `POST /api/bot/start`, `POST /api/bot/pause`, `POST /api/bot/resume`, `POST /api/bot/stop`
- Each endpoint persists the new state to BotConfig before returning
- `GET /api/bot/status` returns: bot state, mode (paper/live), open position count, today's realized P&L, today's trade count, market open flag

### Claude's Discretion
- Bot controller code structure (class, singleton, module-level export — pick whatever fits the existing service pattern)
- Exact Prisma schema field types and constraints
- How the controller is initialized and registered in Express app startup

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within Phase 1 scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | System stores bot trade lifecycle in a persistent database table (BotTrade) so positions survive server restarts | Prisma migration pattern: add BotTrade model with full schema, create timestamped migration SQL |
| INFRA-02 | System stores bot configuration (enabled, mode, thresholds) in a persistent database table (BotConfig) so settings survive restarts | Single-row BotConfig pattern with upsert; all threshold fields defined upfront |
| INFRA-03 | System stores daily trading statistics (daily P&L, trade count, day trade count) in a persistent table (BotDailyStats) for circuit breaker persistence | BotDailyStats keyed on date; upsert on increment |
| INFRA-04 | Bot reconciles open positions against Alpaca's live position data on every server startup before accepting new signals | Alpaca GET /v2/positions endpoint; positions missing from broker → status=missed; async await before enabling signal listeners |
| INFRA-05 | Bot can be enabled or disabled via a persistent kill switch that survives server restarts | BotConfig.enabled field; loaded on startup; restored to last known state |
| INFRA-06 | Bot exposes REST endpoints for start, pause, resume, and stop operations | Express Router pattern matching existing routes/; state transitions validated before persisting |
| INFRA-07 | Bot supports paper trading mode and live trading mode, switched via configuration | BotConfig.mode field ("paper" | "live"); Alpaca base URL switches with mode |
| INFRA-08 | Mode switch from paper to live is blocked when any positions are currently open | Guard in PATCH /api/bot/mode or embedded in start endpoint; check BotTrade.status = "open" count |
</phase_requirements>

---

## Summary

Phase 1 is pure infrastructure: three Prisma models, a singleton bot controller service, a startup reconciliation routine, and five REST endpoints. No signals, no order placement. The existing codebase provides all the patterns needed — Prisma + PostgreSQL is already the persistence layer, Express + Router is the established route pattern, and the module-level export with a `start*()` function is the service initialization convention (see `scanner.ts`, `strategyEngine.ts`).

The only genuine research question is how the Alpaca positions endpoint behaves — specifically the response shape for `GET /v2/positions` — because the reconciliation routine must correctly match DB records to live broker state. The existing `paperTrader.ts` already calls the Alpaca paper API using `fetch()` with `config.alpacaPaperUrl`, establishing the HTTP pattern. The bot controller should follow the same approach and use the same URL variable, which switches between paper and live depending on `BotConfig.mode`.

The Prisma migration workflow is already established in this project: create a timestamped directory under `backend/prisma/migrations/`, write a `migration.sql` file, and run `prisma migrate deploy`. The existing migrations (`20260224000000_add_vwap_tracking`, etc.) confirm this convention. The schema additions are additive (new tables only), so there is zero risk of breaking existing models.

**Primary recommendation:** Follow the exact module-level-export singleton pattern used by `strategyEngine.ts` and `scanner.ts`. Initialize the bot controller inside the `server.listen()` callback in `index.ts` after the `await loadStrategiesFromDb()` call, so the controller starts with the strategy cache warm.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | ^5.10.0 | ORM + migrations | Already in use; `@prisma/client` and `prisma` CLI both present |
| Express | ^4.18.2 | HTTP + routing | Project's established REST framework |
| node-fetch (native `fetch`) | built-in (Node 18+) | Alpaca REST calls | `paperTrader.ts` already uses `fetch()` directly — no additional import needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node-cron` | ^3.x | Scheduled jobs (4 AM reset, 3:45 PM force-close) | **Phase 1 does NOT need this** — deferred to Phase 3 (EXIT-05) and Phase 4 (RISK-04). Do not install in Phase 1. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Module-level singleton | Class instance | Class adds no benefit here; existing services (scanner, strategyEngine) all use module-level exports — stay consistent |
| Prisma migrations folder | `prisma db push` | `db push` is dev-only; project uses `prisma migrate deploy` in production (see `package.json` scripts) — must create migration SQL |

**Installation:**
```bash
# No new dependencies for Phase 1
# node-cron is needed for Phase 3/4 — do NOT add it here
```

---

## Architecture Patterns

### Recommended File Structure

```
backend/src/
├── services/
│   └── botController.ts     # New: singleton state machine + reconciliation
├── routes/
│   └── bot.ts               # New: /api/bot/* REST endpoints
├── index.ts                 # Modified: import botRouter and initBot()
backend/prisma/
├── schema.prisma            # Modified: add BotTrade, BotConfig, BotDailyStats
└── migrations/
    └── 20260228000000_add_bot_tables/
        └── migration.sql    # New: CREATE TABLE statements for 3 models
```

### Pattern 1: Module-Level Singleton (existing project convention)

**What:** Service state lives in module-level `let` variables. A single `init*()` or `start*()` exported function initializes the service. Other exported functions read/mutate the module state.

**When to use:** Always — this is the established pattern for all backend services.

**Example (from existing `strategyEngine.ts` and `scanner.ts`):**
```typescript
// Module-level state
let botState: BotState = 'stopped';
let botConfig: BotConfigRecord | null = null;

// Init called once from index.ts
export async function initBot(): Promise<void> {
  botConfig = await loadConfig();
  botState = botConfig.enabled ? botConfig.lastState as BotState : 'stopped';
  await reconcilePositions();
}

// Exported accessors for other services (Phase 2+ will call these)
export function getBotState(): BotState { return botState; }
export function getBotConfig(): BotConfigRecord { return botConfig!; }
```

### Pattern 2: Prisma Upsert for Single-Row Config Table

**What:** BotConfig is a singleton row. Use `upsert` with a fixed `id` value (e.g., `"singleton"`) for all reads and writes.

**Why:** Avoids "row doesn't exist" errors on first access. Idempotent create-or-update.

**Example:**
```typescript
// Source: Prisma docs - upsert pattern
const config = await prisma.botConfig.upsert({
  where: { id: 'singleton' },
  update: { enabled: true, state: 'running' },
  create: {
    id: 'singleton',
    enabled: true,
    state: 'running',
    mode: 'paper',
    positionSizeUsd: 500,
    // ... all default values
  },
});
```

### Pattern 3: Startup Reconciliation Guard

**What:** Before the bot registers any signal listeners (Phase 2), it must complete reconciliation. Implemented as an async function called in `initBot()` that awaits before returning.

**Example:**
```typescript
async function reconcilePositions(): Promise<void> {
  // Fetch live positions from Alpaca
  const res = await fetch(`${getAlpacaBaseUrl()}/v2/positions`, {
    headers: alpacaHeaders,
  });
  const livePositions: AlpacaPosition[] = res.ok ? await res.json() : [];
  const liveSymbols = new Set(livePositions.map((p) => p.symbol));

  // Find DB open positions that no longer exist at broker
  const dbOpenPositions = await prisma.botTrade.findMany({
    where: { status: 'open' },
  });

  for (const trade of dbOpenPositions) {
    if (!liveSymbols.has(trade.symbol)) {
      await prisma.botTrade.update({
        where: { id: trade.id },
        update: { status: 'missed', exitReason: 'reconciled_missing_on_startup' },
      });
    }
  }
  console.log(`[BotController] Reconciled ${dbOpenPositions.length} open positions`);
}
```

### Pattern 4: State Transition Validation

**What:** Each lifecycle endpoint validates the current state before allowing the transition. Invalid transitions return 400.

**Valid transitions:**
```
stopped  → running   (start)
running  → paused    (pause)
running  → stopped   (stop)
paused   → running   (resume)
paused   → stopped   (stop)
```

**Example:**
```typescript
router.post('/start', requireAuth, async (_req, res) => {
  const current = getBotState();
  if (current === 'running') {
    res.status(400).json({ error: 'Bot is already running' });
    return;
  }
  await persistState('running');
  setBotState('running');
  res.json({ state: 'running' });
});
```

### Pattern 5: Route File + index.ts Registration

**What:** Matches every other route in the project.

```typescript
// routes/bot.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
const router = Router();
// ... endpoints
export default router;

// index.ts additions
import botRouter from './routes/bot';
app.use('/api/bot', botRouter);
// In server.listen callback:
await initBot();
```

### Anti-Patterns to Avoid

- **Using `prisma db push` for migrations:** The project deploys with `prisma migrate deploy`. Always create a migration SQL file in the migrations folder.
- **Initializing bot before strategy cache is warm:** `initBot()` must be called after `await loadStrategiesFromDb()` — Phase 2 will immediately need strategy data, so warm it before enabling the bot.
- **Blocking the `server.listen` callback on reconciliation errors:** Wrap reconciliation in try/catch; log the error but do not prevent server startup if Alpaca is unreachable (e.g., outside market hours or API key missing).
- **Single status endpoint requires auth by default:** Match the `requireAuth` pattern from all other routes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Single-row config table access | Custom "find or create" logic | Prisma `upsert` | Atomic, race-condition-safe, one call |
| Date-keyed daily stats record | Manual "find then create or update" | Prisma `upsert` on date field | Same atomicity benefit |
| Mode-switched Alpaca URL | if/else in every API call | Getter function `getAlpacaBaseUrl()` that reads `botConfig.mode` | Single source of truth; Phase 3 executor just calls the getter |

**Key insight:** Everything needed exists in the current stack. The only risk in this phase is schema design quality — get BotTrade and BotConfig right now because adding columns later requires new migrations that must be deployed to the VPS.

---

## Common Pitfalls

### Pitfall 1: Migration Timestamp Collision

**What goes wrong:** Two migrations with the same timestamp prefix cause `prisma migrate deploy` to fail with a checksum conflict or skip the second migration.

**Why it happens:** Developers copy-paste migration folder names.

**How to avoid:** Use a timestamp at least 1 second later than the most recent migration. The current latest is `20260227000000_add_news_articles`. Use `20260228000000_add_bot_tables` or later.

**Warning signs:** `prisma migrate deploy` exits with "already applied" but tables don't exist.

### Pitfall 2: BotConfig `upsert` Missing Default Values

**What goes wrong:** `prisma.botConfig.upsert({ where: { id: 'singleton' }, update: {}, create: {} })` fails because `create` is missing required fields.

**Why it happens:** Forgetting that `create` must satisfy all non-nullable fields without defaults.

**How to avoid:** Define sensible defaults in the `create` block. Match the defaults documented in REQUIREMENTS.md: positionSize=$500, hardStopLossPct=7, maxConcurrentPositions=3, dailyLossLimit=500, minWinRate=0.5.

### Pitfall 3: Reconciliation Calling Wrong Alpaca URL

**What goes wrong:** Reconciliation always calls the paper API even when mode is live (or vice versa).

**Why it happens:** Hardcoding `config.alpacaPaperUrl` in the reconciliation fetch instead of using a mode-aware getter.

**How to avoid:** Implement a `getAlpacaBaseUrl()` function in `botController.ts` that reads `botConfig.mode` and returns either `config.alpacaPaperUrl` or `config.alpacaLiveUrl`. All Alpaca calls in the bot go through this getter.

**Note:** `config.ts` currently only has `alpacaPaperUrl`. Phase 1 must also add `alpacaLiveUrl: "https://api.alpaca.markets"` to config.ts for completeness, even though live mode won't be used until Phase 6.

### Pitfall 4: State Lost Because `initBot()` Isn't Awaited

**What goes wrong:** Signal listeners (Phase 2) register before reconciliation completes, accepting stale signals against unreconciled position state.

**Why it happens:** `initBot()` called with `startBot()` pattern (fire-and-forget) instead of `await initBot()`.

**How to avoid:** Always `await initBot()` in the `server.listen` callback. The existing pattern already awaits `loadStrategiesFromDb()` — follow the same discipline.

### Pitfall 5: Mode Switch Guard Race Condition

**What goes wrong:** Mode switch is allowed because the open position count check reads 0, but a trade is being placed concurrently.

**Why it happens:** No concurrency protection around position count + mode switch.

**How to avoid:** Phase 1 has no trade placement, so this is theoretical. Document as a known limitation. For Phase 3, the fix is to check position count inside the same Prisma transaction that records the mode change. In Phase 1, a simple DB count check is sufficient since no concurrent placements exist.

### Pitfall 6: `GET /api/bot/status` Missing `marketOpen` Flag

**What goes wrong:** The status endpoint omits the `marketOpen` flag, and Phase 5 UI can't display market status without it.

**Why it happens:** Implementing only the bot state fields and forgetting the market context.

**How to avoid:** Include `marketOpen` in the status response. Determining if the market is open: check current ET time between 9:30 AM and 4:00 PM on weekdays (excluding holidays is out of scope for Phase 1 — a simple time/day-of-week check is acceptable).

---

## Code Examples

### BotTrade Prisma Model (full schema)
```prisma
model BotTrade {
  id             String    @id @default(cuid())
  symbol         String
  entryPrice     Float?
  exitPrice      Float?
  shares         Float?
  pnl            Float?
  catalystType   String?   // catalyst category string e.g. "FDA_APPROVAL"
  catalystTier   Int?      // 1-4
  exitReason     String?   // "trailing_stop" | "hard_stop" | "profit_target" | "time_exit" | "force_close" | "reconciled_missing_on_startup"
  status         String    // "open" | "closed" | "missed"
  alpacaOrderId  String?
  entryAt        DateTime?
  exitAt         DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([status])
  @@index([symbol])
  @@index([createdAt])
}
```

### BotConfig Prisma Model (full schema)
```prisma
model BotConfig {
  id                      String   @id @default("singleton")
  enabled                 Boolean  @default(false)
  state                   String   @default("stopped")    // "stopped" | "running" | "paused"
  mode                    String   @default("paper")      // "paper" | "live"

  // Position sizing
  positionSizeUsd         Float    @default(500)
  confidenceMultiplierHigh Float   @default(2.0)
  confidenceMultiplierMed  Float   @default(1.0)
  confidenceMultiplierLow  Float   @default(0.5)

  // Risk limits
  maxConcurrentPositions  Int      @default(3)
  dailyLossLimitUsd       Float    @default(500)
  minWinRate              Float    @default(0.5)
  hardStopLossPct         Float    @default(7.0)
  maxHoldDurationSec      Int      @default(300)

  // Catalyst tier enablement (array stored as JSON)
  enabledCatalystTiers    Int[]    @default([1, 2, 3, 4])

  // 5 Pillars thresholds
  maxFloatShares          Float    @default(20000000)
  maxSharePrice           Float    @default(20)
  minRelativeVolume       Float    @default(5)

  updatedAt               DateTime @updatedAt
}
```

### BotDailyStats Prisma Model
```prisma
model BotDailyStats {
  id             String   @id @default(cuid())
  date           String   // "YYYY-MM-DD" in ET timezone
  realizedPnl    Float    @default(0)
  tradeCount     Int      @default(0)
  dayTradeCount  Int      @default(0)

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([date])
}
```

### Alpaca GET /v2/positions Response Shape

Based on existing `paperTrader.ts` patterns and Alpaca v2 API (HIGH confidence from existing codebase usage):
```typescript
interface AlpacaPosition {
  symbol: string;
  qty: string;           // string, not number
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
  side: "long" | "short";
}
```
The reconciliation fetch:
```typescript
const res = await fetch(`${getAlpacaBaseUrl()}/v2/positions`, {
  headers: {
    "APCA-API-Key-ID": config.alpacaApiKey,
    "APCA-API-Secret-Key": config.alpacaApiSecret,
  },
});
```

### Market Open Check
```typescript
function isMarketOpen(): boolean {
  // Convert current time to US/Eastern
  const now = new Date();
  const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = etTime.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60;
}
```

### GET /api/bot/status Response Shape
```typescript
{
  state: "stopped" | "running" | "paused",
  mode: "paper" | "live",
  openPositionCount: number,
  todayRealizedPnl: number,
  todayTradeCount: number,
  marketOpen: boolean,
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `prisma db push` for schema changes | `prisma migrate deploy` with SQL migration files | Production-safe; VPS deployment requires explicit migration files |
| Hardcoded paper API URL | Mode-aware URL getter | Required for paper→live switch in Phase 6 without code changes |

**Deprecated/outdated:**
- `config.alpacaPaperUrl` alone in `config.ts`: Phase 1 should add `alpacaLiveUrl` to the config object now, even though Phase 6 activates it — avoids a config.ts edit in Phase 6 that could be forgotten.

---

## Open Questions

1. **Alpaca positions endpoint for paper accounts — does it return empty array or error outside market hours?**
   - What we know: The endpoint is `GET /v2/positions` at `paper-api.alpaca.markets`. It returns an array of position objects.
   - What's unclear: Whether calling it outside market hours or when no positions exist returns `[]` or a non-2xx status.
   - Recommendation: Treat any non-2xx response as "no live positions" and log a warning rather than throwing. This is already the pattern in `getOrder()` in `paperTrader.ts` — return null on non-ok responses.

2. **`Int[]` field in Prisma with PostgreSQL — correct syntax?**
   - What we know: Prisma supports `Int[]` for PostgreSQL integer arrays. The existing schema uses `String[]` for `Watchlist.tickers`.
   - What's unclear: Whether `@default([1, 2, 3, 4])` is valid Prisma syntax for array defaults.
   - Recommendation: If array default syntax causes migration issues, store `enabledCatalystTiers` as a comma-separated `String` field instead (e.g., `"1,2,3,4"`). This is simpler and avoids any array default edge cases. Confirm during migration authoring.

3. **Alpaca headers variable name collision**
   - What we know: `paperTrader.ts` defines `paperHeaders` as a local const. `botController.ts` will need similar headers.
   - What's unclear: Whether to define them locally in `botController.ts` or export a shared helper from a new `alpacaClient.ts` utility.
   - Recommendation: Define them locally in Phase 1. A shared Alpaca client utility is a Phase 3 refactor concern when the executor and position monitor also need headers.

---

## Sources

### Primary (HIGH confidence)

- Existing codebase — `backend/prisma/schema.prisma`: confirmed Prisma 5.10, PostgreSQL, migration folder convention, `String[]` array support
- Existing codebase — `backend/src/services/paperTrader.ts`: confirmed Alpaca paper API URL pattern, `fetch()` with APCA headers, AlpacaOrder response shape
- Existing codebase — `backend/src/services/scanner.ts` + `strategyEngine.ts`: confirmed module-level singleton pattern for services
- Existing codebase — `backend/src/index.ts`: confirmed `server.listen` async callback pattern, sequential `await` calls for service initialization
- Existing codebase — `backend/src/routes/trades.ts` + `analytics.ts`: confirmed Express Router + `requireAuth` pattern
- Existing codebase — `backend/prisma/migrations/`: confirmed timestamped migration folder + `migration.sql` convention

### Secondary (MEDIUM confidence)

- Alpaca Markets API v2 — positions endpoint: `GET /v2/positions` returns array of position objects with `symbol`, `qty` (string), `avg_entry_price` (string) fields. Consistent with Alpaca v2 REST API documentation and observed usage in `paperTrader.ts`.

### Tertiary (LOW confidence)

- `Int[] @default([1, 2, 3, 4])` in Prisma schema: Prisma supports array fields for PostgreSQL, but array literal defaults may require verification against Prisma 5.10 docs. Alternative: store as `String` with comma separation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — entire stack already in use in the project
- Architecture patterns: HIGH — derived directly from existing service files
- Pitfalls: HIGH for migration/upsert pitfalls (known from existing code); MEDIUM for Alpaca API edge cases (outside market hours behavior)

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (30 days — stable stack)
