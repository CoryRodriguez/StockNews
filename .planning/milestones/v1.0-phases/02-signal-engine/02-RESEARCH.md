# Phase 2: Signal Engine - Research

**Researched:** 2026-02-28
**Domain:** News signal evaluation pipeline — deduplication, staleness, 5 Pillars validation, Claude API classification
**Confidence:** HIGH (codebase inspection) / MEDIUM (Claude API pattern) / LOW (float data source)

---

## Summary

Phase 2 builds `botSignalEngine.ts` — a pure evaluation layer that intercepts articles from the three
existing news services (RTPR, Benzinga, Alpaca News), applies a gauntlet of filters, and writes a
`BotSignalLog` record for every article processed. No orders are placed. The log record captures the
outcome (fired, rejected, skip) and the exact rejection reason so thresholds can be calibrated from
real data before Phase 3 wires up trade execution.

The key architectural finding is that none of the three news services expose event emitter hooks or
a callback registration API. They call `executePaperTrade()` directly from their `handleMessage`
functions. The correct non-invasive hookup pattern is to add a single `evaluateBotSignal(article)`
call in each service file alongside the existing `executePaperTrade()` call — one line added to each
of three files. The signal engine itself is a standalone module that imports `getBotState`,
`getBotConfig`, and `classifyCatalystGranular` and runs the full evaluation pipeline.

The 5 Pillars check needs current share price and relative volume, both of which are available from
`getSnapshots()` in `alpaca.ts`. Float shares are NOT available from Alpaca's API — this is a
confirmed gap in Alpaca's data (community forum consensus, no official endpoint). Float validation
must be deferred to a future phase or sourced from an external provider (Finviz free scrape or
Polygon fundamental API). For Phase 2, the float pillar should be skipped with a note in the log,
and the check should only gate on price (<$20) and relative volume (>=5x).

The Claude API (SIG-11) is a new dependency. Package `@anthropic-ai/sdk` is not yet in
`backend/package.json`. The call pattern is straightforward: `client.messages.create()` with a
structured system prompt and a user prompt containing the headline, body, and 5 Pillars context.
The API key must be added to the environment and `config.ts`. A 2-second timeout requirement means
the call must be wrapped with `AbortSignal.timeout` or SDK timeout option and a fallback path when
it times out (log the article as "ai-timeout" and reject).

**Primary recommendation:** Build `signalEngine.ts` as a single service file that registers a
module-level per-source reconnect cooldown Map, a deduplication Map keyed on `symbol|normalizedTitle`,
and exposes one public function `evaluateBotSignal(article: RtprArticle): Promise<void>`. Add one
call to that function in each of the three news service files, guard it behind `getBotState() === 'running'`.
Use only price + relative volume for the 5 Pillars check in Phase 2; defer float validation.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SIG-01 | Bot evaluates incoming articles from RTPR, Benzinga, and Alpaca News | Hook into all three service files; `evaluateBotSignal(article)` called in each |
| SIG-02 | Filter by enabled catalyst tiers from `BotConfig.enabledCatalystTiers` | `getBotConfig().enabledCatalystTiers.split(',').map(Number)` — already in BotConfigRecord |
| SIG-03 | Gate on strategy engine win rate ≥ `minWinRate` | `getStrategy(category, null, new Date()).winRate` — strategyEngine.ts already exports this |
| SIG-04 | Dedup same event from multiple sources within 5-minute window | Map<string, number> keyed on `${symbol}|${normalizedTitle}` with TTL cleanup |
| SIG-05 | Reject articles older than 90 seconds | `Date.now() - new Date(article.createdAt).getTime() > 90_000` |
| SIG-06 | Suppress evaluation 30 seconds after any source reconnect | Per-source `reconnectAt: Map<string, number>` in signal engine module state |
| SIG-07 | Log every evaluated signal with outcome and reason | New `BotSignalLog` Prisma model OR Prisma-free `console.log` in Phase 2 |
| SIG-08 | Log-only mode — no orders placed during Phase 2 | Signal engine never calls tradeExecutor; log outcome only |
| SIG-09 | Suppress buy signals during 9:30–9:45 AM ET opening auction | Time check in ET using same `Intl.DateTimeFormat` pattern as `botController.ts` |
| SIG-10 | Validate 5 Pillars before allowing signal to proceed | `getSnapshots([ticker])` for price + relativeVolume; float deferred (see research) |
| SIG-11 | Hybrid pipeline: tier 1-2 fast path; tier 3-4 → Claude API evaluation | `@anthropic-ai/sdk` messages.create with 2-second timeout; fallback on timeout |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | ^0.61+ (latest) | Claude API messages.create for SIG-11 | Official Anthropic TypeScript SDK; auto-manages headers, retries, types |
| `@prisma/client` | ^5.10.0 (existing) | BotSignalLog persistence | Already in project; zero new dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js built-ins | - | `AbortSignal.timeout()` for Claude API call timeout | Eliminates external timeout library |

### NOT Needed
| Skip | Reason |
|------|--------|
| EventEmitter refactor of news services | Too invasive for Phase 2; direct call is simpler and safer |
| Finviz/Polygon float data | Float validation deferred; Phase 2 only gates on price + rvol |
| `node-cron` | Already identified for Phase 3/4; not needed in Phase 2 |

**Installation (new dependency only):**
```bash
cd backend && npm install @anthropic-ai/sdk
```

Add to `backend/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

Add to `backend/src/config.ts`:
```typescript
anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
```

---

## Architecture Patterns

### Recommended File Layout
```
backend/src/services/
├── signalEngine.ts          # NEW: Phase 2 main module
├── botController.ts         # Existing (Phase 1) — export getBotState, getBotConfig
├── catalystClassifier.ts    # Existing — export classifyCatalystGranular
├── strategyEngine.ts        # Existing — export getStrategy
├── alpaca.ts               # Existing — export getSnapshots (for 5 Pillars price+rvol)
├── alpacaNews.ts           # Modified: +1 line calling evaluateBotSignal
├── benzinga.ts             # Modified: +1 line calling evaluateBotSignal
└── rtpr.ts                 # Modified: +1 line calling evaluateBotSignal
```

### DB Schema Addition (for SIG-07 log)
```
backend/prisma/
├── schema.prisma            # Add BotSignalLog model
└── migrations/
    └── 20260228000001_add_bot_signal_log/
        └── migration.sql
```

### Pattern 1: Hook into existing news services (non-invasive)

**What:** Add one fire-and-forget call to `evaluateBotSignal(article)` in each news service, alongside the existing `executePaperTrade()` call.

**When to use:** Always — never refactor the services' internal WebSocket handling.

```typescript
// In alpacaNews.ts, benzinga.ts, rtpr.ts — example from rtpr.ts handleMessage:
// EXISTING (do not touch):
const activeScanners = getActiveScannersForTicker(article.ticker);
if (activeScanners.length > 0) {
  executePaperTrade(article, activeScanners).catch(...)
}

// NEW — add after the existing block:
evaluateBotSignal(article).catch((err) =>
  console.error("[SignalEngine] Uncaught error:", err)
);
```

**Key constraint:** `evaluateBotSignal` must never throw synchronously (wrap the body in try/catch). The news handler must never block.

### Pattern 2: Reconnect cooldown — per-source tracking

**What:** Each news source (rtpr, benzinga, alpaca) has its own WebSocket; reconnect events happen independently. The cooldown must be tracked per source, not globally.

**Signal engine module state:**
```typescript
// Source-keyed reconnect cooldown (ISO-string timestamp of most recent reconnect event)
const reconnectAt = new Map<string, number>(); // source → Date.now() at reconnect
const RECONNECT_SUPPRESS_MS = 30_000;

// Called by news service when its WebSocket reconnects
export function notifyReconnect(source: string): void {
  reconnectAt.set(source, Date.now());
}

function isReconnectSuppressed(source: string): boolean {
  const ts = reconnectAt.get(source);
  if (!ts) return false;
  return Date.now() - ts < RECONNECT_SUPPRESS_MS;
}
```

**Wire-up in each news service's `connect()` function** — call `notifyReconnect('rtpr')` / `notifyReconnect('benzinga')` / `notifyReconnect('alpaca')` from the `ws.on("close")` handler, NOT from `ws.on("open")`. The suppression window starts when the connection drops (when stale articles may begin replaying), not when it comes back.

Actually: the suppression should start on the `"open"` event after a reconnect — the first `N` seconds of articles after re-authentication may be replayed. Track `reconnectedAt` in each service's `ws.on("open")` handler after the first `connect()` call:

```typescript
// In each service, module-level flag:
let hasConnectedOnce = false;

ws.on("open", () => {
  if (hasConnectedOnce) {
    // This is a reconnect — notify signal engine
    notifyReconnect('rtpr'); // or 'benzinga', 'alpaca'
  }
  hasConnectedOnce = true;
  // ... existing auth logic
});
```

### Pattern 3: Deduplication across sources

**What:** The same news event may arrive from RTPR, Benzinga, and Alpaca News within seconds. Only one signal evaluation should fire.

**Key:** `${symbol}|${normalizedTitle}` where `normalizedTitle` = `title.toLowerCase().replace(/[^a-z0-9]/g, '')`.
This handles minor whitespace/punctuation differences between sources.

**Implementation:**
```typescript
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface DedupEntry {
  firedAt: number;
  sources: string[];
}

const dedupMap = new Map<string, DedupEntry>();

function isDuplicate(symbol: string, title: string, source: string): boolean {
  const key = `${symbol}|${title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const existing = dedupMap.get(key);
  if (existing && Date.now() - existing.firedAt < DEDUP_WINDOW_MS) {
    existing.sources.push(source); // track which sources sent it
    return true;
  }
  dedupMap.set(key, { firedAt: Date.now(), sources: [source] });
  return false;
}

// Periodic cleanup to prevent memory growth:
setInterval(() => {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [key, entry] of dedupMap) {
    if (entry.firedAt < cutoff) dedupMap.delete(key);
  }
}, DEDUP_WINDOW_MS);
```

### Pattern 4: 5 Pillars check (Phase 2 scope)

**What:** For Phase 2, validate price < $20 and relative volume >= 5x. Skip float check (data not available from Alpaca).

```typescript
interface FivePillarsResult {
  passed: boolean;
  failedPillar?: 'price' | 'relative_volume' | 'float'; // float never fails in Phase 2
  price: number;
  relativeVolume: number;
}

async function checkFivePillars(symbol: string): Promise<FivePillarsResult> {
  const cfg = getBotConfig();
  const snaps = await getSnapshots([symbol]);
  if (!snaps.length) return { passed: false, failedPillar: 'price', price: 0, relativeVolume: 0 };

  const snap = snaps[0];
  if (snap.price > cfg.maxSharePrice) {
    return { passed: false, failedPillar: 'price', price: snap.price, relativeVolume: snap.relativeVolume };
  }
  if (snap.relativeVolume < cfg.minRelativeVolume) {
    return { passed: false, failedPillar: 'relative_volume', price: snap.price, relativeVolume: snap.relativeVolume };
  }
  // Float check deferred — log as "float-unverified" but do not fail
  return { passed: true, price: snap.price, relativeVolume: snap.relativeVolume };
}
```

### Pattern 5: Claude API call (SIG-11)

**What:** For tier 3-4 and unclassified articles that pass 5 Pillars, call Claude API for a proceed/decline decision.

**Install:** `npm install @anthropic-ai/sdk` in `backend/`

**TypeScript pattern (verified from official docs):**
```typescript
// Source: https://platform.claude.com/docs/en/api/client-sdks
import Anthropic from "@anthropic-ai/sdk";

// Module-level client (created once, reused — recommended pattern)
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: config.anthropicApiKey, // reads from config.ts
      timeout: 2000, // 2-second timeout for SIG-11 requirement
    });
  }
  return anthropicClient;
}

interface AiEvaluation {
  proceed: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

async function evaluateWithAI(
  symbol: string,
  headline: string,
  body: string,
  fivePillars: { price: number; relativeVolume: number }
): Promise<AiEvaluation | null> {
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251022", // Use Haiku for latency/cost
      max_tokens: 150,
      system: `You are a day-trading signal evaluator. Evaluate if a news headline warrants a momentum buy.
Respond with JSON only: {"proceed": true|false, "confidence": "high"|"medium"|"low", "reasoning": "one sentence"}.
Rules: Proceed = true only for clear positive catalysts with high momentum potential. Decline speculative, vague, or negative news.`,
      messages: [{
        role: "user",
        content: `Symbol: ${symbol}
Headline: ${headline}
Body: ${body.slice(0, 300)}
Price: $${fivePillars.price.toFixed(2)}, RelVol: ${fivePillars.relativeVolume.toFixed(1)}x`
      }]
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return JSON.parse(text) as AiEvaluation;
  } catch (err) {
    // Timeout, rate limit, or parse failure — return null to trigger "ai-timeout" rejection
    console.warn("[SignalEngine] AI evaluation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
```

**Model choice rationale:** Use `claude-haiku-4-5-20251022` (fastest, cheapest) not Opus/Sonnet. The 2-second timeout requirement makes speed critical. Haiku typically responds in 300-800ms for short prompts.

### Pattern 6: BotSignalLog Prisma model (SIG-07)

**What:** Every article evaluation gets a DB record. This is the Phase 2 audit trail that Phase 5 UI will read.

```prisma
// Add to backend/prisma/schema.prisma
model BotSignalLog {
  id              String   @id @default(cuid())
  symbol          String
  source          String   // "rtpr" | "benzinga" | "alpaca"
  headline        String   @db.Text
  catalystCategory String?  // from classifyCatalystGranular — null if classifed as OTHER
  catalystTier    Int?     // 1-5; null if not classified
  outcome         String   // "fired" | "rejected" | "skipped"
  rejectReason    String?  // "not-running" | "stale" | "reconnect-cooldown" | "duplicate" |
                           // "market-closed" | "opening-auction" | "tier-disabled" |
                           // "danger-pattern" | "below-win-rate" | "failed-5-pillars" |
                           // "ai-declined" | "ai-timeout" | "log-only"
  failedPillar    String?  // "price" | "relative_volume" | "float" — when rejectReason = "failed-5-pillars"
  aiProceed       Boolean? // true/false from Claude API; null if not sent to AI
  aiConfidence    String?  // "high" | "medium" | "low" from Claude API
  aiReasoning     String?  @db.Text
  winRateAtEval   Float?   // strategy engine win rate at evaluation time
  priceAtEval     Float?   // snapshot price when evaluated
  relVolAtEval    Float?   // snapshot relative volume when evaluated
  articleCreatedAt DateTime? // article.createdAt parsed
  evaluatedAt     DateTime  @default(now())

  @@index([symbol])
  @@index([outcome])
  @@index([evaluatedAt])
}
```

### Pattern 7: Full evaluation pipeline (sequence)

Every article entering `evaluateBotSignal(article)` runs this exact sequence. First rejection reason wins.

```
1. Guard: getBotState() === 'running'?           → NO: skip silently (no log)
2. Guard: isMarketOpen()?                        → NO: skip silently (no log)
3. Guard: reconnect cooldown?                    → YES: reject "reconnect-cooldown"
4. Guard: staleness check (> 90 seconds old)?   → YES: reject "stale"
5. Guard: duplicate (same symbol+title < 5 min)?→ YES: skip silently (counted by dedup entry)
6. Classify: classifyCatalystGranular(headline, body)
   → null: reject "danger-pattern"
   → tier > 4: reject "tier-disabled" (OTHER tier 5)
7. Guard: tier in enabledCatalystTiers?          → NO: reject "tier-disabled"
8. Guard: opening auction 9:30-9:45 AM ET?      → YES: reject "opening-auction"
9. Guard: strategy win rate >= minWinRate?      → NO: reject "below-win-rate"
10. Pillar check: getSnapshots(symbol)
    → price > maxSharePrice: reject "failed-5-pillars" + failedPillar="price"
    → relVol < minRelativeVolume: reject "failed-5-pillars" + failedPillar="relative_volume"
11. Branch on tier:
    - Tier 1-2: outcome = "fired" (log-only in Phase 2: rejectReason = "log-only")
    - Tier 3-4 / OTHER: call Claude API
      → proceed=true: outcome = "fired" (log-only: rejectReason = "log-only")
      → proceed=false: reject "ai-declined"
      → null (timeout): reject "ai-timeout"
12. Write BotSignalLog record with all collected context
```

### Anti-Patterns to Avoid

- **Calling `notifyReconnect` from `ws.on("close")`:** Articles arriving during the reconnect gap don't hit the signal engine anyway (WebSocket is closed). The suppression window needs to cover the first 30 seconds AFTER reconnect. Call from `ws.on("open")` on reconnects, not on close.
- **Using a single global reconnect flag:** Three sources reconnect independently. RTPR reconnecting should not suppress Benzinga evaluation.
- **Making `evaluateBotSignal` synchronous:** The `getSnapshots` call and Claude API call are async. Never block the news handler thread. Always fire-and-forget with `.catch()`.
- **Logging every article that arrives when bot is stopped:** The `getBotState() !== 'running'` guard must be a silent skip — no DB write. Otherwise the BotSignalLog fills with thousands of irrelevant entries.
- **Hardcoding the dedup key on `article.createdAt`:** RTPR, Benzinga, and Alpaca timestamp the same article differently. Normalize on title text, not timestamp. Timestamps from different sources can differ by 1-2 minutes for the same underlying event.
- **Using a tier 5 article (`OTHER`) in the fast path:** tier 5 / `OTHER` must go to Claude API, not the fast path. Fast path is strictly tier 1-2.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Claude API HTTP call | Raw `fetch` to `api.anthropic.com` | `@anthropic-ai/sdk` | Auth headers, retry logic, type safety, timeout config all handled |
| Float shares data | Alpaca snapshot scraping | Skip for Phase 2; note in log | Alpaca confirmed not to provide float; scraping fragile |
| Market hours check | New `isMarketHours()` function | `isMarketOpen()` from `botController.ts` | Already implemented and exported |
| ET timezone conversion | Manual UTC offset math | `Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })` | Same pattern as `getTodayDateET()` in botController.ts |
| Strategy win rate lookup | Custom DB query | `getStrategy(category, null, new Date()).winRate` | strategyEngine.ts already caches this |
| Price/volume snapshot | New Alpaca REST call | `getSnapshots([ticker])` from `alpaca.ts` | Already implemented with caching and error handling |

**Key insight:** The existing codebase already has all data primitives. The signal engine is purely combinatorial logic on top of what already exists.

---

## Common Pitfalls

### Pitfall 1: Benzinga is polling, not WebSocket
**What goes wrong:** Benzinga uses `setInterval` polling (15s), not a WebSocket. There is no `ws.on("close")` / `ws.on("open")` lifecycle. `notifyReconnect('benzinga')` has no natural trigger.
**Why it happens:** Benzinga was built as a REST poller, not a WebSocket subscriber.
**How to avoid:** For Benzinga, the reconnect cooldown is irrelevant (polls are stateless). Set `notifyReconnect('benzinga')` to a no-op or simply don't register Benzinga in the reconnect map. The 30-second suppression requirement (SIG-06) only applies to WebSocket sources (RTPR, Alpaca News).
**Warning signs:** If the reconnect suppression logic checks for 'benzinga' source and finds no entry, that is correct behavior — Benzinga never reconnects.

### Pitfall 2: Strategy engine returns zero win rate on fresh install
**What goes wrong:** `getStrategy()` returns `DEFAULT_STRATEGY` with `winRate: 0, sampleSize: 0`. With `minWinRate: 0.5` (50%), every signal is rejected as "below-win-rate".
**Why it happens:** The strategy cache is empty until at least 3 paper trades per category are completed.
**How to avoid:** During Phase 2 (log-only mode), check `strategy.sampleSize === 0` and treat it as a pass (log `winRateAtEval: null`, don't reject). The win-rate gate only kicks in when there is actual data. Document this behavior explicitly in BotSignalLog with a `winRateAtEval` of `null` to distinguish "no data yet" from "below threshold".
**Warning signs:** All signals rejected with "below-win-rate" on the first day of running.

### Pitfall 3: Benzinga `article.createdAt` is RFC 2822 format
**What goes wrong:** Benzinga articles have `created: "Thu, 24 Feb 2025 10:00:00 -0500"` in RFC 2822 format. `benzinga.ts` already converts this to ISO string before creating the `RtprArticle`. However, the signal engine receives `RtprArticle.createdAt` as an ISO string. The staleness check `Date.now() - new Date(article.createdAt).getTime() > 90_000` is safe — `new Date()` handles ISO strings correctly.
**Why it happens:** bzinga.ts converts correctly; this is a non-issue but worth verifying.
**How to avoid:** Trust the `RtprArticle.createdAt` ISO string — benzinga.ts converts at source. Verify with a test log during Phase 2 bring-up.

### Pitfall 4: Claude API `timeout` option behavior
**What goes wrong:** The `@anthropic-ai/sdk` `timeout` option is in milliseconds and applies at the socket level. If the network is healthy but Claude is slow, the request may complete in 2100ms and throw a timeout error. The 2-second requirement (SIG-11) is strict.
**Why it happens:** LLM inference time is non-deterministic. Haiku is typically 300-800ms but can spike.
**How to avoid:** Set SDK timeout to 2000ms. Catch `APIError` with code `408` or any timeout error. Log as "ai-timeout" and reject the signal. Never let an AI timeout block the news handler.
**Warning signs:** Occasional "ai-timeout" rejections in the signal log during market hours — this is expected behavior, not a bug.

### Pitfall 5: seenIds in alpacaNews.ts causes dedup collision
**What goes wrong:** `alpacaNews.ts` has its own `seenIds` Set that deduplicates by Alpaca article ID. If the same article arrives twice from Alpaca (e.g., after reconnect), the second copy is dropped before `evaluateBotSignal` is called. This is correct — the signal engine dedup layer is the cross-source layer, not the within-source layer.
**Why it happens:** Each news service has its own within-service dedup. The signal engine dedup layer handles cross-service dedup.
**How to avoid:** Do not remove the existing `seenIds` sets in any news service. They are the first line of dedup defense and should stay. The signal engine dedup map (`dedupMap`) is the second line for cross-source convergence.

### Pitfall 6: Opening auction window check (SIG-09)
**What goes wrong:** 9:30–9:45 AM ET. If the check uses `isMarketOpen()` from botController.ts, it returns `true` during the opening auction (9:30 AM is inside the 9:30-4:00 PM window). A separate check for the opening auction window is needed.
**Why it happens:** `isMarketOpen()` is not fine-grained enough — it does not have a 9:30–9:45 exclusion zone.
**How to avoid:** Add a helper in the signal engine:
```typescript
function isOpeningAuction(): boolean {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  const totalMinutes = et.getHours() * 60 + et.getMinutes();
  return totalMinutes >= 9 * 60 + 30 && totalMinutes < 9 * 60 + 45;
}
```

---

## Code Examples

### Verified: Claude SDK TypeScript pattern
```typescript
// Source: https://platform.claude.com/docs/en/api/client-sdks
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: config.anthropicApiKey,
  timeout: 2000, // 2 seconds — matches SIG-11 requirement
});

const response = await client.messages.create({
  model: "claude-haiku-4-5-20251022",
  max_tokens: 150,
  system: "System prompt here",
  messages: [{ role: "user", content: "User message here" }]
});

// Access response text:
const text = response.content[0]?.type === "text" ? response.content[0].text : "";
```

### Verified: getSnapshots usage for 5 Pillars
```typescript
// Source: backend/src/services/alpaca.ts (lines 113-151, verified by direct read)
// getSnapshots returns Snapshot[] where Snapshot has:
//   ticker, price, relativeVolume, volume, avgVolume30d, changePct, gapPct, high, low, hasNews

const snaps = await getSnapshots([symbol]); // already handles errors, returns [] on failure
if (!snaps.length) {
  // No data — treat as failed pillar
}
const snap = snaps[0];
// snap.price — latest trade price
// snap.relativeVolume — volume / 30-day avg volume (already computed in getSnapshots)
```

### Verified: Strategy engine win rate lookup
```typescript
// Source: backend/src/services/strategyEngine.ts (lines 69-91, verified by direct read)
// getStrategy returns StrategyRecommendation with winRate, sampleSize, confidence

const strategy = getStrategy(classification.category, null, new Date());
// strategy.winRate: 0-1 (0 when no data — sampleSize === 0)
// strategy.sampleSize: number of trades this is based on

if (strategy.sampleSize > 0 && strategy.winRate < getBotConfig().minWinRate) {
  // Reject: below win rate threshold
}
// If sampleSize === 0: no data yet, pass through (don't reject)
```

### Verified: catalystClassifier tier determination
```typescript
// Source: backend/src/services/catalystClassifier.ts (lines 208-225, verified by direct read)
// classifyCatalystGranular returns CatalystClassification | null
// - null: danger pattern matched (short sell signal, offering, FDA reject, etc.)
// - { category: CatalystCategory, tier: number }: 1=M&A, 2=FDA, 3=Earnings, 4=Contracts, 5=OTHER

const classification = classifyCatalystGranular(article.title, article.body);
if (classification === null) {
  // danger pattern — log "danger-pattern" and stop
}
// classification.tier: 1-5
// classification.category: "MA_ACQUISITION" | "FDA_APPROVAL" | ... | "OTHER"

// Tier 1-2 = fast path; Tier 3-4 = Claude API; Tier 5 (OTHER) = Claude API
const needsAI = classification.tier >= 3;
```

---

## State of the Art

| Old Approach | Current Approach | Reason |
|--------------|------------------|--------|
| Direct `executePaperTrade()` call in news handlers | `evaluateBotSignal()` alongside existing call | Non-invasive; existing paper trading unaffected |
| No dedup across sources | `Map<string, DedupEntry>` keyed on `symbol|normalizedTitle` | Same catalyst arrives from 2-3 sources |
| No staleness check | 90-second `article.createdAt` gate | Docker restart replays DB-loaded articles as "new" |
| No reconnect suppression | Per-source `reconnectAt` Map | Post-reconnect article burst from live feeds |

**Not-yet-implemented (deferred):**
- Float shares validation: Alpaca does not provide float data. Deferred to future integration (Finviz or Polygon).
- AI classification for tier 3-4 news: Requires `@anthropic-ai/sdk` install and `ANTHROPIC_API_KEY` environment variable.

---

## Open Questions

1. **Float data source for SIG-10**
   - What we know: Alpaca snapshot endpoint does not return float shares. Community forum confirms this is a long-standing gap.
   - What's unclear: The `TradeAnalytics` schema has a `floatShares Float?` field — was this populated anywhere historically? Check `tradeAnalytics.ts` to see if any float enrichment code exists.
   - Recommendation: Skip float validation in Phase 2. Log `failedPillar: null` and note in BotSignalLog that float was not checked. A future micro-phase can add a float lookup from an external source.

2. **Strategy engine cold start during Phase 2 calibration**
   - What we know: With zero paper trades completed, `getStrategy()` returns `DEFAULT_STRATEGY` with `winRate: 0, sampleSize: 0`. With `minWinRate: 0.5`, every signal would be blocked.
   - What's unclear: Should Phase 2 operate in "win-rate bypass" mode until N trades are accumulated?
   - Recommendation: Bypass win-rate gate when `strategy.sampleSize === 0`. Log the signal with `winRateAtEval: null`. The planner should explicitly document this bypass in the task.

3. **`ANTHROPIC_API_KEY` environment variable**
   - What we know: This key does not currently exist in `.env` or `config.ts`.
   - What's unclear: Whether the user has an Anthropic account and key ready.
   - Recommendation: Plan task must add `anthropicApiKey` to `config.ts` and document that `ANTHROPIC_API_KEY` must be set in `.env` and Docker Compose for SIG-11 to function. If key is absent, tier 3-4 articles should fall back to "ai-unavailable" rejection rather than crash.

4. **Haiku model ID currency**
   - What we know: The model ID `claude-haiku-4-5-20251022` was the latest Haiku available at research time.
   - What's unclear: Anthropic may have released a newer Haiku version by implementation time.
   - Recommendation: Use model string as a constant in `config.ts` (e.g., `claudeSignalModel: "claude-haiku-4-5-20251022"`) so it can be updated without code changes. The SDK will return an error if the model is invalid.

---

## Sources

### Primary (HIGH confidence)
- Direct read of `backend/src/services/alpacaNews.ts` — reconnect pattern, `notifyReconnect` hookup points
- Direct read of `backend/src/services/benzinga.ts` — confirmed polling (not WebSocket); no reconnect lifecycle
- Direct read of `backend/src/services/rtpr.ts` — `RtprArticle` interface, reconnect pattern, `scheduleReconnect` function
- Direct read of `backend/src/services/catalystClassifier.ts` — tier definitions (1=M&A, 2=FDA, 3=Earnings, 4=Contracts, 5=OTHER), `classifyCatalystGranular` signature
- Direct read of `backend/src/services/alpaca.ts` — `getSnapshots()` return shape including `relativeVolume` and `price`
- Direct read of `backend/src/services/strategyEngine.ts` — `getStrategy()` signature and `winRate` field on `StrategyRecommendation`
- Direct read of `backend/src/services/botController.ts` — `getBotState()`, `getBotConfig()`, `isMarketOpen()` exports confirmed
- Direct read of `backend/prisma/schema.prisma` — `BotTrade`, `BotConfig`, `BotDailyStats` models; `TradeAnalytics.floatShares Float?` field noted
- Direct read of `backend/src/index.ts` — startup sequence; news services start before `initBot()`
- [platform.claude.com/docs/en/api/client-sdks](https://platform.claude.com/docs/en/api/client-sdks) — TypeScript SDK install and `messages.create` pattern

### Secondary (MEDIUM confidence)
- WebSearch → verified with official docs: `@anthropic-ai/sdk` package name, `model: "claude-haiku-4-5-20251022"` as fast model for latency-sensitive use cases
- WebSearch → Claude API `timeout` option in Anthropic SDK constructor

### Tertiary (LOW confidence)
- [forum.alpaca.markets/t/where-to-find-float-or-outstanding-shares-in-api/3756](https://forum.alpaca.markets/t/where-to-find-float-or-outstanding-shares-in-api/3756) — confirmed Alpaca does not provide float data; forum post from 2020-2023 range, may have changed (LOW confidence the gap persists in 2026, but no current evidence of float endpoint)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct package.json inspection; `@anthropic-ai/sdk` install confirmed as only new dependency
- Architecture patterns: HIGH — all patterns derive from direct code inspection of existing services
- 5 Pillars (price + rvol): HIGH — `getSnapshots()` fields confirmed in alpaca.ts
- 5 Pillars (float): LOW — Alpaca confirmed not to provide this; float validation deferred
- Claude API pattern: MEDIUM — verified from official docs; model ID currency is uncertain at implementation time
- Reconnect cooldown pattern: HIGH — RTPR and Alpaca News reconnect patterns confirmed in code; Benzinga confirmed as polling-only

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable domain) — Claude model IDs may change; verify before implementation
