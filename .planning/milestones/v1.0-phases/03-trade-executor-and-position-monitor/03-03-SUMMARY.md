---
phase: 03-trade-executor-and-position-monitor
plan: "03"
subsystem: trading-bot
tags: [node-cron, alpaca, prisma, position-monitor, exit-logic, typescript]

# Dependency graph
requires:
  - phase: 03-trade-executor-and-position-monitor
    provides: BotConfig with hardStopLossPct, profitTargetPct, maxHoldDurationSec fields
  - phase: 01-bot-infrastructure-foundation
    provides: BotTrade prisma model, botController.ts (getBotConfig, getAlpacaBaseUrl)
  - phase: existing
    provides: alpaca.ts getSnapshots() batch price fetch
provides:
  - positionMonitor.ts — 5-second exit loop watching all open bot positions
  - Hard stop / profit target / time exit in priority order (EXIT-01, EXIT-03, EXIT-04)
  - EOD force-close cron at 3:45 PM ET Mon-Fri (EXIT-05)
  - Batch 5s polling via getSnapshots() (EXIT-06)
  - addPosition() / removePosition() / startPositionMonitor() public API
affects: [03-04-startup-wiring, phase-4-risk-management, phase-5-frontend-dashboard]

# Tech tracking
tech-stack:
  added:
    - "node-cron ^3.x — scheduled jobs with timezone support"
    - "@types/node-cron — TypeScript definitions"
  patterns:
    - "sold boolean guard: set true BEFORE first await to prevent double-exit race conditions"
    - "Leaf service pattern: positionMonitor imports only alpaca + botController, never executor or ws"
    - "Batch snapshot polling: ONE getSnapshots() call per cycle for ALL open symbols"
    - "Exit priority: hard stop > profit target > time exit (checked in order, return after first)"

key-files:
  created:
    - backend/src/services/positionMonitor.ts
  modified:
    - backend/package.json
    - backend/package-lock.json

key-decisions:
  - "EXIT-02 (trailing stop) deferred to Phase 4 per user decision; peakPrice tracked as groundwork only"
  - "setInterval starts at module load — always active after import, not gated by bot running state"
  - "Position monitor continues running even when bot is paused — pausing means no new entries, not abandoning exits"
  - "closePosition removes from openPositions map immediately after setting sold=true — prevents any concurrent poll from retrying"
  - "Sell order uses qty (shares we hold), not notional — selling existing position, not opening a new one"
  - "closePosition never throws — errors are logged and swallowed to keep poll loop alive"
  - "node-cron with America/New_York timezone ensures DST-correct 3:45 PM ET scheduling"

patterns-established:
  - "Race condition guard: set sold=true + remove from map BEFORE first await in closePosition"
  - "EOD cron fetches current price per position for accurate P&L on force_close_eod"

requirements-completed: [EXIT-01, EXIT-03, EXIT-04, EXIT-05, EXIT-06]

# Metrics
duration: 8min
completed: 2026-02-28
---

# Phase 3 Plan 03: Position Monitor Summary

**5-second exit watchdog with hard stop / profit target / time exit conditions plus 3:45 PM ET EOD force-close cron using node-cron with America/New_York timezone**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-28T20:00:00Z
- **Completed:** 2026-02-28T20:08:00Z
- **Tasks:** 1
- **Files modified:** 3 (1 created, 2 updated)

## Accomplishments
- Created positionMonitor.ts with TrackedPosition interface and sold boolean race condition guard
- Implemented checkExitConditions with hard stop / profit target / time exit in priority order
- closePosition sets sold=true and removes from map before any async sell — prevents double-exit
- Market sell order placed via Alpaca REST API (qty-based, not notional)
- 5-second setInterval poll loop using batch getSnapshots() for all open symbols
- node-cron EOD force-close at 3:45 PM ET Mon-Fri with DST-correct timezone config
- Exported startPositionMonitor / addPosition / removePosition for Plan 03-04 wiring
- peakPrice tracked as groundwork for Phase 4 trailing stop (EXIT-02 deferred per user decision)
- node-cron + @types/node-cron installed (first use of cron in this project)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create positionMonitor.ts — exit loop, sell logic, addPosition interface** - `16931ed` (feat)

## Files Created/Modified
- `backend/src/services/positionMonitor.ts` - 5s poll exit loop, EOD cron, TrackedPosition map with sold guard
- `backend/package.json` - Added node-cron and @types/node-cron dependencies
- `backend/package-lock.json` - Dependency lockfile updated

## Decisions Made
- EXIT-02 trailing stop deferred to Phase 4 per explicit user decision; peakPrice field is tracked and updated each poll cycle but never used to trigger an exit — pure groundwork
- setInterval starts at module load time, making it always active. Position monitor continues even when bot is paused (pausing stops new signals, not open position exits)
- closePosition never re-throws — the monitor loop must survive any single-position sell failure to continue protecting other open positions
- EOD cron uses node-cron with `{ timezone: 'America/New_York' }` option, ensuring the job fires at 3:45 PM ET correctly across DST transitions without manual UTC offset math

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing node-cron dependency**
- **Found during:** Task 1 (writing import statement)
- **Issue:** `import cron from 'node-cron'` would fail at runtime — node-cron was listed as the only new dependency in research but not yet installed
- **Fix:** `npm install node-cron && npm install --save-dev @types/node-cron`
- **Files modified:** backend/package.json, backend/package-lock.json
- **Verification:** `npx tsc --noEmit` passes with cron import resolving correctly
- **Committed in:** 16931ed (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — missing dependency)
**Impact on plan:** Necessary prerequisite. No scope creep.

## Issues Encountered
- None — plan executed as written after installing node-cron

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- positionMonitor.ts is a complete leaf service ready for Plan 03-04 wiring
- startPositionMonitor() must be called once from server startup after initBot()
- addPosition() must be called by tradeExecutor.ts after fill confirmation (Plan 03-04)
- All five exit requirements EXIT-01 through EXIT-06 (except EXIT-02 deferred) delivered

## Self-Check: PASSED

- FOUND: backend/src/services/positionMonitor.ts
- FOUND: backend/package.json (updated with node-cron)
- FOUND commit 16931ed: feat(03-03): create positionMonitor.ts — 5s exit loop, EOD cron, position map

---
*Phase: 03-trade-executor-and-position-monitor*
*Completed: 2026-02-28*
