---
phase: 02-signal-engine
plan: "02"
subsystem: signal-engine
tags: [signal, evaluation, botSignalLog, dedup, catalyst, 5-pillars]

# Dependency graph
requires:
  - phase: 02-signal-engine
    plan: "01"
    provides: BotSignalLog Prisma model + prisma client regenerated
  - phase: 01-bot-infrastructure-foundation
    provides: getBotState, getBotConfig, isMarketOpen from botController
provides:
  - signalEngine.ts with evaluateBotSignal() and notifyReconnect() exports
  - Full 10-step evaluation gauntlet (all non-AI code paths)
  - Per-source reconnect cooldown map (30s suppression)
  - Dedup map keyed on symbol|normalizedTitle with 5-min window
  - BotSignalLog writes for every non-silent-skip outcome
affects:
  - 02-03-signal-engine (adds AI branch + hooks notifyReconnect into ws services)
  - 03-* (Phase 3 trade executor replaces log-only outcome with real orders)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Evaluation gauntlet: guards fire in strict sequence — first rejection wins and is logged"
    - "Silent skips (bot not running, market closed, dedup): no DB write, return immediately"
    - "writeSignalLog() helper wraps prisma.botSignalLog.create() with catch — never throws"
    - "Per-source reconnect suppression: notifyReconnect(source) called from ws.on('open') after first connect"
    - "Dedup key: symbol|normalizedTitle (lowercase, alphanumeric only) — not createdAt"

key-files:
  created:
    - backend/src/services/signalEngine.ts
  modified: []

key-decisions:
  - "Silent skips for bot-not-running and market-closed write no DB record — keeps BotSignalLog clean and queryable"
  - "Dedup is also a silent skip — no DB record for duplicates seen within 5-minute window"
  - "5 Pillars: empty getSnapshots() response treated as failed price pillar to guard against API outages"
  - "Win-rate gate bypassed when sampleSize === 0 (no trade history yet) — winRateAtEval logged as null in that case"
  - "Tier 1-2 outcome=fired with rejectReason=log-only during Phase 2 — phase 3 replaces this with real orders"
  - "Tier 3-4 placeholder: outcome=skipped, rejectReason=ai-unavailable — Plan 02-03 replaces with Claude AI call"

patterns-established:
  - "evaluateBotSignal(article): full pipeline entry point — fire-and-forget from news service message handlers"
  - "notifyReconnect(source): call from ws.on('open') after first connect to start 30s cooldown"

requirements-completed: [SIG-02, SIG-03, SIG-04, SIG-05, SIG-06, SIG-08, SIG-09, SIG-10]

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 2 Plan 02: Signal Evaluation Gauntlet Summary

**10-step evaluation gauntlet in signalEngine.ts: state/market guards, reconnect cooldown, staleness (90s), dedup (5-min), catalyst classification, tier gate, opening auction, win-rate gate, 5 Pillars check, and tier branch with log-only fast path for tier 1-2**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-28T17:07:14Z
- **Completed:** 2026-02-28T17:08:46Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `backend/src/services/signalEngine.ts` (440 lines) implementing all 11 pipeline steps
- Exported `evaluateBotSignal(article: RtprArticle): Promise<void>` — full gauntlet entry point
- Exported `notifyReconnect(source: string): void` — starts 30s per-source reconnect suppression
- Module-level `reconnectAt` Map (per-source) and `dedupMap` (symbol|normalizedTitle keyed) with auto-cleanup
- All non-silent-skip outcomes write a `BotSignalLog` record via the `writeSignalLog()` helper
- Silent skips (bot not running, market closed, duplicate): return immediately with no DB write
- TypeScript compiles clean: zero new errors

## Task Commits

1. **Task 1: signalEngine.ts — full evaluation gauntlet** - `ca3b780` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `backend/src/services/signalEngine.ts` — New file, 440 lines. Complete signal evaluation pipeline.

## Decisions Made

- Silent skips for bot-not-running and market-closed write no DB record — keeps BotSignalLog clean and queryable for analytics
- Dedup is also a silent skip — avoids polluting the audit log with redundant "seen it" entries
- Empty getSnapshots() response treated as failed price pillar — protects against API outages causing false signals
- Win-rate gate bypassed when sampleSize === 0 (no trade history yet); winRateAtEval is null in that case
- Tier 1-2: outcome=fired, rejectReason=log-only (Phase 2 log-only mode; Phase 3 replaces with real order submission)
- Tier 3-4: outcome=skipped, rejectReason=ai-unavailable (Plan 02-03 replaces placeholder with Claude AI call)

## Deviations from Plan

None - plan executed exactly as written. The `getStrategy()` signature in strategyEngine.ts takes `(catalystCategory, marketCap | null, tradeTime)` which matches the plan's call pattern `getStrategy(classification.category, null, new Date())`.

## Pipeline Step Reference

| Step | Guard/Action | Rejection | DB Write? |
|------|-------------|-----------|-----------|
| 1 | getBotState() === 'running' | silent skip | No |
| 2 | isMarketOpen() | silent skip | No |
| 3 | isReconnectSuppressed(source) | reconnect-cooldown | Yes |
| 4 | articleAge > 90s | stale | Yes |
| 5 | isDuplicate(symbol, title) | silent skip | No |
| 6a | classifyCatalyst() === null | danger-pattern | Yes |
| 6b | tier >= 5 | tier-disabled | Yes |
| 7 | tier in enabledCatalystTiers | tier-disabled | Yes |
| 8 | isOpeningAuction() | opening-auction | Yes |
| 9 | winRate < minWinRate (when sampleSize > 0) | below-win-rate | Yes |
| 10a | snaps.length === 0 | failed-5-pillars (price) | Yes |
| 10b | price > maxSharePrice | failed-5-pillars (price) | Yes |
| 10c | relVol < minRelativeVolume | failed-5-pillars (relative_volume) | Yes |
| 11a | tier 1-2 | fired / log-only | Yes |
| 11b | tier 3-4 | skipped / ai-unavailable | Yes |

## Self-Check: PASSED

- FOUND: backend/src/services/signalEngine.ts (440 lines, > 150 minimum)
- FOUND: export function evaluateBotSignal
- FOUND: export function notifyReconnect
- FOUND: botSignalLog.create references (DB writes present)
- FOUND: reconnectAt Map (reconnect state exists)
- FOUND: dedupMap Map (dedup state exists)
- FOUND: commit ca3b780 (Task 1 — signalEngine.ts)
- tsc --noEmit: zero errors

---
*Phase: 02-signal-engine*
*Completed: 2026-02-28*
