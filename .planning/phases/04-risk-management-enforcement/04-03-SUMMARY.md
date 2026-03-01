---
phase: 04-risk-management-enforcement
plan: "03"
subsystem: positionMonitor
tags: [trailing-stop, exit-conditions, cron, risk-management, EXIT-02, RISK-04]
dependency_graph:
  requires: [04-01]
  provides: [EXIT-02, RISK-04, getOpenPositionCount, getOpenSymbols]
  affects: [positionMonitor.ts]
tech_stack:
  added: []
  patterns: [trailing-stop-precedence, cron-guard, in-memory-position-helpers]
key_files:
  created: []
  modified:
    - backend/src/services/positionMonitor.ts
decisions:
  - "EXIT-02 inserted between EXIT-01 and EXIT-03 — hard stop provides absolute floor, trailing stop locks in gains"
  - "pct-based trailing stop takes precedence over dollar-based when both configured > 0"
  - "peakPrice resets to entryPrice on server restart — documented as known limitation; hard stop still protects"
  - "cronsScheduled guard added to startPositionMonitor() — prevents duplicate cron registration on repeated calls"
  - "4AM daily reset cron logs day boundary but does no active clearing — BotDailyStats are date-keyed, new row auto-created on first trade"
  - "getOpenPositionCount and getOpenSymbols already present from parallel Plan 04-02 execution — comment updated, no duplicate export"
metrics:
  duration: "7 minutes"
  completed: "2026-02-28"
  tasks_completed: 2
  files_modified: 1
---

# Phase 04 Plan 03: Trailing Stop and Daily Reset Summary

**One-liner:** EXIT-02 trailing stop wired into positionMonitor.ts checkExitConditions() with pct/dollar precedence rule, plus RISK-04 4AM daily reset cron and cronsScheduled guard.

---

## What Was Built

### Task 1: Wire EXIT-02 trailing stop into checkExitConditions()

Replaced the "DEFERRED TO PHASE 4" placeholder comment with real exit logic in `checkExitConditions()`.

**Insertion point:** Between EXIT-01 (hard stop) and EXIT-03 (profit target) — preserving the critical safety ordering.

**Implementation:**
```typescript
const trailPct    = cfg.trailingStopPct;    // 0 = disabled
const trailDollar = cfg.trailingStopDollar; // 0 = disabled

if (trailPct > 0) {
  // Percentage trailing stop takes precedence
  const stopPrice = pos.peakPrice * (1 - trailPct / 100);
  if (currentPrice <= stopPrice) {
    await closePosition(pos, currentPrice, 'trailing_stop');
    return;
  }
} else if (trailDollar > 0) {
  // Dollar trailing stop — only when pct is not configured (= 0)
  const stopPrice = pos.peakPrice - trailDollar;
  if (currentPrice <= stopPrice) {
    await closePosition(pos, currentPrice, 'trailing_stop');
    return;
  }
}
```

**Precedence rule:** pct-based wins over dollar-based when both configured > 0. Dollar-based only fires when trailPct === 0.

**Default behavior:** Both fields default to 0 (disabled per Plan 04-01 schema). No existing behavior changes without explicit configuration.

**Known limitation:** peakPrice is initialized to entryPrice on startup via reconcilePositions(). If server restarts while position is open, peak resets. Hard stop (EXIT-01) still provides absolute downside protection.

Also updated:
- File-level JSDoc to include EXIT-02 in the exit condition list (removed "deferred" note)
- `peakPrice` field comment in `TrackedPosition` interface
- `checkExitConditions()` peak-update comment from "deferred to Phase 4" to "used by EXIT-02 trailing stop below"

### Task 2: 4AM daily reset cron (RISK-04) and cronsScheduled guard

**scheduleDailyReset() function:**
```typescript
function scheduleDailyReset(): void {
  cron.schedule('0 4 * * 1-5', async () => {
    console.log('[PositionMonitor] 4AM daily reset — clearing in-memory daily state');
    // BotDailyStats are date-keyed — new row auto-created on first trade of day
    console.log('[PositionMonitor] Daily reset complete');
  }, { timezone: 'America/New_York' });
  console.log('[PositionMonitor] Daily reset cron scheduled (4:00 AM ET, Mon-Fri)');
}
```

Schedule: `0 4 * * 1-5` — 4:00 AM ET, Monday through Friday. DST-correct via `timezone: 'America/New_York'`.

**cronsScheduled guard in startPositionMonitor():**
```typescript
let cronsScheduled = false;

export function startPositionMonitor(): void {
  if (cronsScheduled) return; // guard: prevent duplicate cron registration
  cronsScheduled = true;
  scheduleEodForceClose();
  scheduleDailyReset();
  console.log('[PositionMonitor] Started — ..., daily reset at 4:00 AM ET');
}
```

**getOpenPositionCount() and getOpenSymbols():** These were already added to the file by the parallel Plan 04-02 execution. The comment was updated to reflect final purpose; no duplicate export was introduced.

---

## Verification Results

All checks from plan verification block passed:

1. Trailing stop logic present — `trailPct`, `trailDollar`, `trailing_stop` all present
2. Exit order preserved — EXIT-01 (line 51) before EXIT-02 (line 56) before EXIT-03 (line 79)
3. 4AM cron present — `scheduleDailyReset` + `0 4 * * 1-5` on lines 186-197
4. New exports present — `getOpenPositionCount` (line 240), `getOpenSymbols` (line 248)
5. cronsScheduled guard in startPositionMonitor — lines 36, 207, 208
6. `tsc --noEmit` passes with no errors

---

## Deviations from Plan

### Parallel plan 04-02 pre-populated getOpenPositionCount() and getOpenSymbols()

**Found during:** Reading positionMonitor.ts before making changes

**Details:** Plan 04-02 executed in parallel and added `getOpenPositionCount()` and `getOpenSymbols()` before this plan ran. The functions were already present and correct. This plan updated the section comment to remove the "wave completion order" note and replace with the final explanation.

**Impact:** No conflict — functions are identical to what this plan would have added. No re-implementation needed.

---

## Commits

| Commit | Description |
|--------|-------------|
| b9f98e1 | feat(04-03): wire EXIT-02 trailing stop and RISK-04 4AM cron in positionMonitor |

---

## Self-Check: PASSED

- `backend/src/services/positionMonitor.ts` — FOUND (modified)
- Commit b9f98e1 — FOUND
- `tsc --noEmit` — PASSED, no errors
