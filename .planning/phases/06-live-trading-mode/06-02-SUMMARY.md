---
phase: 06-live-trading-mode
plan: "06-02"
subsystem: ui
tags: [react, typescript, zustand, alpaca, trading]

# Dependency graph
requires:
  - phase: 06-01
    provides: GET /api/bot/gate and POST /api/bot/mode routes + GoLiveGate interface
  - phase: 05-04
    provides: BotPanel.tsx full implementation with status/history/signals/config tabs
provides:
  - Inline live-mode gate display in BotPanel status tab showing all three gate criteria
  - Switch to LIVE Trading button with confirmation dialog (paper mode only, stopped state)
  - Switch to PAPER button (live mode only, stopped state)
  - CONFIRM LIVE button disabled when gate.passed is false or gate is loading
  - CANCEL button clears dialog without any API call
  - Re-fetch GET /api/bot/status after mode switch to update header mode badge
affects:
  - 06-03 (phase 6 verification — this UI is what gets visually verified)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline state confirmation dialog pattern (same approach as draft/saving/saveError config flow)"
    - "Gate-gated action: async fetch gate then display before allowing confirm"
    - "Re-fetch status after mode switch to update derived display (Pitfall 3 avoidance)"

key-files:
  created: []
  modified:
    - frontend/src/components/panels/BotPanel.tsx

key-decisions:
  - "GoLiveGate interface defined locally in BotPanel.tsx (mirrors backend interface, avoids cross-package import)"
  - "Mode switch section only visible when state === stopped (prevents mode change while trades active)"
  - "Re-fetch GET /api/bot/status after successful mode switch to update header mode badge (not stale local mutation)"
  - "openLiveConfirm() fetches gate before showing dialog — user sees loading state then gate data"
  - "CONFIRM LIVE disabled on !liveGate?.passed || liveGateLoading (both conditions prevent premature submit)"

patterns-established:
  - "Async gate check before destructive action: fetch gate → show state → enable/disable confirm"
  - "modeSwitchError shown inside dialog when open, outside dialog after close (live→paper path)"

requirements-completed: [LIVE-02, LIVE-03]

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 6 Plan 02: Live Mode Gate UI Summary

**BotPanel inline live-mode confirmation dialog with three-criteria gate display (tradeCount/winRate/cleanDays) and POST /api/bot/mode wiring — paper-to-live switch requires all gate criteria met, live-to-paper is always allowed**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-01T14:50:00Z
- **Completed:** 2026-03-01T14:55:15Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments
- Added GoLiveGate interface, four new state variables, and two handler functions to BotPanel.tsx
- Wired GET /api/bot/gate and POST /api/bot/mode into the existing component pattern
- Inline confirmation dialog shows all three gate criteria (completed trades, win rate, clean days) with pass/fail indicators
- Mode switch section conditionally rendered only when bot is stopped
- tsc --noEmit passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add mode-switch state, handlers, and UI to BotPanel.tsx** - `5d084aa` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `frontend/src/components/panels/BotPanel.tsx` - Added GoLiveGate interface, four state vars, openLiveConfirm() and handleModeSwitch() handlers, inline mode-switch section in status tab

## Decisions Made
- GoLiveGate interface defined locally in BotPanel.tsx to mirror the backend GoLiveGate without cross-package imports
- Mode switch section only appears when `state === "stopped"` to prevent mode changes while the bot is actively managing positions
- Re-fetch GET /api/bot/status after successful mode switch ensures the header mode badge (PAPER/LIVE) reflects the new state without stale optimistic updates
- CONFIRM LIVE button disabled on `!liveGate?.passed || liveGateLoading` — both gates prevent premature submission
- modeSwitchError displayed inside the dialog when open, outside the dialog after close (covers live-to-paper error path)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BotPanel now has full live-mode gate UI (LIVE-02 and LIVE-03 complete)
- Ready for Plan 06-03: Phase 6 automated verification suite + human visual checkpoint
- The gate display and mode switch buttons will be tested in 06-03 verification

---
*Phase: 06-live-trading-mode*
*Completed: 2026-03-01*
