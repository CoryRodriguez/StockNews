---
phase: 05-frontend-bot-dashboard
plan: "05-04"
subsystem: ui
tags: [react, zustand, tailwind, websocket, trading-bot, dashboard]

# Dependency graph
requires:
  - phase: 05-01
    provides: Backend bot REST endpoints and WebSocket broadcasts
  - phase: 05-02
    provides: botStore.ts Zustand store with BotStatus/BotPosition/BotTrade/BotSignal/BotConfig types
  - phase: 05-03
    provides: useSocket.ts bot channel wiring, BotPanel stub in Dashboard.tsx

provides:
  - Full BotPanel React component with four tabs (status, history, signals, config)
  - Live status display with StatusBadge, mode, PDT counter, today P&L
  - Open positions table with live unrealized P&L via watchlistStore.prices
  - Completed trades history list with entry/exit prices, P&L, exit reason, catalyst
  - Rejected signals list with reject reason labels mapped to human-readable text
  - Full BotConfig inline editor with 19 fields, client-side validation, Save button
  - Bot control buttons (pause/resume/start/stop) with per-state visibility
  - Emergency STOP button with red styling
  - Mount-time data hydration via 5 concurrent Promise.all fetch calls

affects: [phase-06-live-trading, deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Promise.all for parallel data hydration on component mount
    - Graceful P&L fallback when price not in watchlistStore (shows entryPrice as current)
    - Per-state button visibility (pause only when running, resume only when paused, start only when stopped)
    - Draft state pattern for config editing (local copy, saves on explicit Save click)
    - REJECT_LABELS lookup map for human-readable rejection reason display

key-files:
  created:
    - frontend/src/components/panels/BotPanel.tsx
  modified: []

key-decisions:
  - "Graceful degradation for unrealized P&L: show entryPrice as current when watchlistStore has no price for the symbol (avoids adding subscribeQuoteChannel complexity to useSocket.ts)"
  - "botAction POST returns { state } and spreads into existing status object to avoid a full re-fetch"
  - "Config save validates positionSizeUsd > 0 and minWinRate 0-1 client-side before sending PATCH"
  - "StatusBadge shows market_closed when state is running but marketOpen is false"
  - "pdtResetDay() uses ETZ via toLocaleString for DST-correct next-weekday calculation"

patterns-established:
  - "Panel: h-full flex flex-col bg-panel overflow-hidden with shrink-0 header and flex-1 overflow-y-auto body"
  - "Sub-component rows: px-2 py-1.5 border-b border-border text-xs font-mono hover:bg-surface"
  - "Config field row: flex justify-between with text-muted label and number/text input on right"

requirements-completed: [UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 5 Plan 04: Frontend Bot Dashboard — BotPanel Full Implementation Summary

**BotPanel React component delivering four-tab bot dashboard (status/history/signals/config) with live P&L, PDT counter, 19-field inline config editor, and per-state control buttons backed by REST hydration via Promise.all**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T09:22:44Z
- **Completed:** 2026-03-01T09:24:28Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced the BotPanel stub (4 lines) with a 444-line full four-tab implementation
- Status tab shows StatusBadge (running/paused/stopped/market_closed), mode label, PDT counter (N/3 used, N left, resets Day), today P&L, trades count, open positions list with unrealized P&L
- History tab lists completed bot trades with entry price, exit price, P&L (green/red), exit reason, catalyst type
- Signals tab lists rejected signals with human-readable reject label (REJECT_LABELS map covers all 16 rejection reasons), catalyst category, tier, timestamp
- Config tab renders all 19 BotConfig fields as inline editable number/text inputs with step/min hints; Save button sends PATCH /api/bot/config with client-side validation; error display on failure
- Header control buttons: PAUSE (yellow, shown when running), RESUME (green, shown when paused), START (green, shown when stopped), STOP (red, shown when not stopped)
- Mount useEffect fires 5 concurrent fetches via Promise.all — status, positions, trades, signals, config hydrated simultaneously
- PositionRow reads watchlistStore.prices for live price; graceful fallback to entryPrice when symbol not yet tracked

## Task Commits

Each task was committed atomically:

1. **Task 1: Build BotPanel.tsx — complete four-tab panel component** - `43fdc8c` (feat)

**Plan metadata:** (to be committed in final docs commit)

## Files Created/Modified
- `frontend/src/components/panels/BotPanel.tsx` - Full BotPanel implementation replacing 4-line stub; 444 lines; StatusBadge, PositionRow, BotTradeRow, SignalRow, ConfigRow sub-components; four-tab main component with REST hydration and bot control actions

## Decisions Made
- Graceful degradation for unrealized P&L: `watchlistStore.prices[symbol]?.price ?? entryPrice` — avoids adding `subscribeQuoteChannel` to useSocket.ts; position tickers not in watchlist show $0 unrealized P&L until user adds them to watchlist
- `botAction()` POST response spreads `{ state }` into existing status object to avoid a full re-fetch round trip
- `handleSave()` validates `positionSizeUsd > 0` and `minWinRate` in [0,1] before sending PATCH
- StatusBadge resolves "market_closed" display when bot is running but market is closed
- `pdtResetDay()` uses `toLocaleString("en-US", { timeZone: "America/New_York" })` for DST-correct next business day calculation

## Deviations from Plan

None - plan executed exactly as written. The inline type imports (`import("../../store/botStore").BotStatus`) were used instead of a named import to avoid name conflicts with `BotStatus` in the Promise.all tuple typing; this is a minor implementation detail, not a deviation.

## Issues Encountered
None - tsc --noEmit passed with zero errors on first attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BotPanel is complete — all UI-01 through UI-07 requirements delivered across Phase 5 plans 01-04
- Phase 5 is now 4/5 plans complete (plan 05-05 TBD)
- Phase 6 (Live Trading Mode) can proceed after Phase 5 wraps

---
*Phase: 05-frontend-bot-dashboard*
*Completed: 2026-03-01*
