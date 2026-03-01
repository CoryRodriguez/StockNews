---
phase: 04-risk-management-enforcement
plan: 02
subsystem: signal-engine, trade-executor, position-monitor
tags: [risk-management, signal-gates, PDT, concurrent-positions, per-symbol-concentration]
dependency_graph:
  requires: [04-01]
  provides: [RISK-02-gate, RISK-03-gate, RISK-05-gate]
  affects: [signalEngine.ts, tradeExecutor.ts, positionMonitor.ts]
tech_stack:
  added: []
  patterns: [fail-open-on-API-error, write-log-before-return, inline-guard-function]
key_files:
  created: []
  modified:
    - backend/src/services/signalEngine.ts
    - backend/src/services/tradeExecutor.ts
    - backend/src/services/positionMonitor.ts
decisions:
  - "getOpenPositionCount and getOpenSymbols added to positionMonitor.ts in this plan (not 04-03) to ensure tsc passes regardless of Wave 2 completion order"
  - "checkPdtLimit fails open on any API error — Alpaca maintenance windows must not block all trades"
  - "PDT check skipped entirely in paper mode — paper account is >$25k, rule does not apply"
  - "Already-holding check moved upstream to signalEngine so BotSignalLog captures full article context (headline, source, catalystCategory) at rejection time"
metrics:
  duration: 88s
  completed: 2026-02-28
  tasks_completed: 2
  files_modified: 3
---

# Phase 4 Plan 02: Signal-Layer Risk Gates (RISK-02, RISK-03, RISK-05) Summary

Signal-layer and executor-layer risk gates added: max concurrent positions (RISK-02), per-symbol concentration (RISK-05) in signalEngine.ts as steps 10.5 and 10.6, and PDT enforcement (RISK-03) in tradeExecutor.ts as step 3.5 with fail-open behavior on API errors.

## What Was Built

### signalEngine.ts — Steps 10.5 and 10.6

Two new rejection gates inserted between step 10 (5 Pillars) and step 11 (tier branch):

**Step 10.5 — RISK-02: Max Concurrent Positions**
- Calls `getOpenPositionCount()` imported from `positionMonitor.ts`
- If `openCount >= config.maxConcurrentPositions`, writes `BotSignalLog` with `outcome='rejected'`, `rejectReason='max-positions'`
- Full article context captured: symbol, source, headline, catalystCategory, catalystTier, winRateAtEval, priceAtEval, relVolAtEval

**Step 10.6 — RISK-05: Per-Symbol Concentration**
- Calls `getOpenSymbols().has(symbol)` imported from `positionMonitor.ts`
- If already holding the symbol, writes `BotSignalLog` with `outcome='rejected'`, `rejectReason='already-holding'`
- Moves the silent duplicate skip from `tradeExecutor.ts` upstream to the signal engine so audit log gets full article context
- The `hasOpenPosition()` guard in `tradeExecutor.ts` step 2 remains as a safety net

**Import added:**
```typescript
import { getOpenPositionCount, getOpenSymbols } from "./positionMonitor";
```

### tradeExecutor.ts — Step 3.5

**`checkPdtLimit()` helper function:**
- Paper mode: always returns `false` (PDT rule doesn't apply to >$25k accounts)
- Live mode: calls `GET /v2/account` via Alpaca REST API, checks `daytrade_count >= 3`
- Fails open on any API error or non-200 response — logs warning but allows trade
- Uses existing `getAlpacaHeaders()` and `getAlpacaBaseUrl()` infrastructure

**PDT guard in `executeTradeAsync()`:**
- Inserted as step 3.5 after `getNotional()` and before `placeNotionalBuyOrder()`
- If `checkPdtLimit()` returns true: logs warning, writes `BotTrade` with `status='rejected'`, `exitReason='pdt_limit'`, returns without placing order

### positionMonitor.ts — Risk Gate Exports

Added `getOpenPositionCount()` and `getOpenSymbols()` exports at module bottom:
- Both added in this plan (04-02) alongside signalEngine.ts import requirements
- Plan 04-03 runs in Wave 2 in parallel and may also declare these — stubs ensure tsc passes regardless of completion order
- `getOpenPositionCount()`: returns `openPositions.size`
- `getOpenSymbols()`: returns `new Set([...openPositions.values()].map(p => p.symbol))`

## Edge Cases

- **API fail-open**: `checkPdtLimit()` returns `false` on any Alpaca error — intentional; Alpaca maintenance windows must not freeze the bot
- **Wave 2 parallelism**: `getOpenPositionCount`/`getOpenSymbols` exports added here to avoid import errors if 04-02 compiles before 04-03
- **Safety net preserved**: `hasOpenPosition()` in `tradeExecutor.ts` step 2 remains as silent skip even though 10.6 now handles upstream — defense in depth
- **tsc deferred to 04-04**: TypeScript is not checked in this plan per plan spec; verification suite in 04-04 confirms compile

## Commits

| Hash | Description |
|------|-------------|
| c4c93de | feat(04-02): add RISK-02 and RISK-05 gates to signalEngine.ts |
| 9b95639 | feat(04-02): add PDT enforcement to tradeExecutor.ts (RISK-03) |

## Deviations from Plan

### Auto-added Stub Exports

**[Rule 2 - Missing Critical Functionality] Added getOpenPositionCount/getOpenSymbols to positionMonitor.ts**
- **Found during:** Task 1
- **Issue:** signalEngine.ts imports these functions from positionMonitor.ts, but plan 04-03 (which adds them) runs in parallel and may not have completed yet — TypeScript would fail to compile
- **Fix:** Added the two export functions directly to positionMonitor.ts in this plan rather than waiting for 04-03
- **Files modified:** `backend/src/services/positionMonitor.ts`
- **Commit:** c4c93de

## Self-Check: PASSED

All files verified present on disk. Both task commits confirmed in git history.
