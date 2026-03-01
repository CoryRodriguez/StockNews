---
phase: 07-end-of-day-recap-evaluation-framework
plan: 03
subsystem: ui
tags: [react, zustand, typescript, websocket, bot-dashboard]

# Dependency graph
requires:
  - phase: 07-02
    provides: GET /api/bot/recap?date= endpoint and DailyRecap data shapes

provides:
  - useRecapStore Zustand store with RecapData, RecapSummary types, recapUnread state, selectedDate, loading/error
  - pageStore Page type extended with "recap"
  - BotPanel 5th "Recap" tab: hero P&L, score badge, stats grid, benchmarks, suggestions, date picker, badge dot
  - recap_ready WebSocket handler in useSocket.ts sets recapUnread to true
  - recap_ready added to WsMessage type union in types/index.ts

affects:
  - 07-04 (recap page — uses RecapData types from recapStore, setPage("recap") navigation target)
  - 07-05 (verification will check BotPanel recap tab integration)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useRecapStore.getState() inside WebSocket callback (not hook) — same pattern as useBotStore.getState()"
    - "Normalize two API response shapes (persisted DailyRecap row vs computed RecapData) in fetch effect"
    - "Badge dot on tab using relative/absolute positioning with -right-1.5 offset"

key-files:
  created:
    - frontend/src/store/recapStore.ts
  modified:
    - frontend/src/store/pageStore.ts
    - frontend/src/hooks/useSocket.ts
    - frontend/src/types/index.ts
    - frontend/src/components/panels/BotPanel.tsx

key-decisions:
  - "recap_ready added to WsMessage union type in types/index.ts to resolve TS2339 (property type does not exist on never)"
  - "setRecap(null) branch added for API responses missing both .summary and .date — prevents stale recap display on empty dates"
  - "eslint-disable-line on recap fetch effect — token intentionally omitted from deps (changes should not re-fetch recap)"

patterns-established:
  - "BotPanel tab badge dot: relative span wrapper with absolute dot positioned at -top-0.5 -right-1.5"

requirements-completed:
  - RECAP-TAB
  - RECAP-NAV
  - RECAP-BADGE-DOT
  - RECAP-WS

# Metrics
duration: 15min
completed: 2026-03-01
---

# Phase 7 Plan 03: BotPanel Recap Tab Summary

**Zustand recapStore with RecapData/RecapSummary types, BotPanel 5th Recap tab (hero P&L, score badge, stats grid, badge dot, date picker, full recap link), and WebSocket recap_ready handler**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-01T21:54:00Z
- **Completed:** 2026-03-01T22:09:19Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created recapStore.ts with full RecapData and RecapSummary TypeScript interfaces matching both persisted DB row and computed recap response shapes
- Extended pageStore Page type and WsMessage union type with recap-specific entries
- Added recap_ready WebSocket handler to useSocket.ts that sets recapUnread=true via store getState() pattern
- Built 5th Recap tab in BotPanel with: date picker, hero P&L (green/red), score badge (color-coded 0-100), win/loss/trades/signals/best-worst stats grid, SPY/QQQ benchmarks, suggestions list, and "View full recap" navigation link
- Badge dot on the Recap tab button when recapUnread=true; clears on tab click

## Task Commits

Each task was committed atomically:

1. **Task 1: recapStore, pageStore, useSocket recap_ready** - `0ae19bd` (feat)
2. **Task 2: BotPanel 5th Recap tab** - `5bc33cb` (feat)

**Plan metadata:** (committed with SUMMARY.md)

## Files Created/Modified
- `frontend/src/store/recapStore.ts` (created) - useRecapStore Zustand store with RecapData, RecapSummary, RecapState types
- `frontend/src/store/pageStore.ts` (modified) - Page type extended with "recap"
- `frontend/src/hooks/useSocket.ts` (modified) - Import useRecapStore; recap_ready message handler added
- `frontend/src/types/index.ts` (modified) - recap_ready variant added to WsMessage union type
- `frontend/src/components/panels/BotPanel.tsx` (modified) - 5th Recap tab with full summary card UI

## Decisions Made
- recap_ready added to WsMessage union in types/index.ts — the existing handler pattern caused TS2339 ("property type does not exist on type 'never'") because TypeScript narrows exhaustively; adding the new variant resolved it cleanly
- setRecap(null) explicit branch for empty responses — plan's fetch code didn't handle the case where API returns a 404 or empty body; null clears stale data and shows "No recap data" message
- eslint-disable-line on fetch effect dependency array — token excluded intentionally; date or tab changes should trigger re-fetch but token changes should not (already stable after login)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added recap_ready to WsMessage type union**
- **Found during:** Task 1 (useSocket.ts recap_ready handler)
- **Issue:** TypeScript error TS2339 — `Property 'type' does not exist on type 'never'` because WsMessage union was exhausted without recap_ready variant
- **Fix:** Added `| { type: "recap_ready"; channel: string; date: string }` to WsMessage union in types/index.ts
- **Files modified:** frontend/src/types/index.ts
- **Verification:** `npx tsc --noEmit` passes with no errors
- **Committed in:** `0ae19bd` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — missing WsMessage type variant)
**Impact on plan:** Essential for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the WsMessage type gap documented above.

## Next Phase Readiness
- recapStore types (RecapData, RecapSummary) are ready for the full /recap page to import
- setPage("recap") navigation target is wired — 07-04 must implement the recap page component at that route
- recapUnread state flows from WS → store → BotPanel badge dot — fully operational

## Self-Check: PASSED

- FOUND: frontend/src/store/recapStore.ts
- FOUND: frontend/src/store/pageStore.ts (recap in Page type)
- FOUND: frontend/src/hooks/useSocket.ts (recap_ready handler)
- FOUND: frontend/src/components/panels/BotPanel.tsx (5 tabs)
- FOUND: .planning/phases/07-end-of-day-recap-evaluation-framework/07-03-SUMMARY.md
- Commit 0ae19bd exists (Task 1)
- Commit 5bc33cb exists (Task 2)
- TypeScript compilation: PASSED (npx tsc --noEmit returns 0)

---
*Phase: 07-end-of-day-recap-evaluation-framework*
*Completed: 2026-03-01*
