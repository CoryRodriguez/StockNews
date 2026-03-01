# Phase 5: Frontend Bot Dashboard - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a Bot Panel to the existing react-grid-layout dashboard that shows real-time bot status, live open positions with ticking P&L, completed bot trade history, evaluated-but-rejected signals, and a configuration editor. Also adds pause/resume/emergency stop controls. Monitoring and control only — no changes to bot trading logic (Phase 3/4 territory).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation decisions are delegated to Claude. Specific choices to make:

- **Panel structure**: Single `BotPanel` grid tile with internal tab navigation (Status/Positions | History | Signals | Config). Matches how users think of "the bot" as one thing. Add `"bot"` to `PanelType` union and `renderPanel()` in Dashboard.tsx.

- **Bot controls placement**: Pause, resume, and emergency stop buttons live inside the BotPanel header, next to the status badge. Consistent with ScannerPanel pattern (controls in header). Emergency stop is visually distinct (red).

- **Config editing UX**: Inline editable fields in the Config tab with a Save button. No modal. Simple key-value form for: catalyst tiers, position size USD, max concurrent positions, daily loss limit, minimum win rate %, hard stop %, max hold duration. Changes POST to `/api/bot/config` and persist in DB.

- **Signal rejection display**: Separate "Signals" tab within BotPanel showing last 100 rejected signals: ticker, catalyst type, timestamp, rejection reason. Newest at top. Does not auto-clear (scrollable log).

- **Open positions P&L**: Positions table subscribed to `quote_update` WebSocket messages (already handled by `watchlistStore`). Bot positions use the same price feed. Each row shows: ticker, entry price, current price, unrealized P&L ($), shares, catalyst type.

- **PDT counter**: Visible in Status tab header row — "PDT: 2/3 day trades used | 1 remaining (resets Thu)"

- **Completed bot trade history**: Uses same row pattern as existing `TradesPanel` (entry price, exit price, P&L, exit reason, catalyst type). Distinct from paper trades — shows only autonomous bot trades.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches consistent with the existing dark-theme font-mono panel design.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TradesPanel.tsx`: Row component pattern (ticker + P&L, buy/sell prices, catalyst) — reuse or adapt for bot trade history
- `useSocket.ts`: WebSocket subscription via channel system — add `bot:status`, `bot:positions`, `bot:signals` channels
- Zustand stores (`tradesStore`, `scannerStore`): Pattern for slice-based state — create `botStore.ts` following the same shape
- `Dashboard.tsx` `renderPanel()`: Add `case "bot": return <BotPanel />`
- `PanelType` in `types/index.ts`: Add `"bot"` to the union

### Established Patterns
- Panel anatomy: `bg-panel` header with `border-b border-border`, `text-xs font-mono`, `overflow-y-auto flex-1` body
- Status colors: `text-up` (green), `text-down` (red), `text-yellow-400` (warning), `text-blue-400` (holding), `text-muted` (neutral)
- REST on mount + WebSocket for live updates (see TradesPanel, ScannerPanel)
- Zustand with typed state + selectors

### Integration Points
- `PanelType` union → add `"bot"`
- `renderPanel()` in Dashboard.tsx → add bot case
- `useSocket.ts` → add handlers for new bot WS message types
- New `botStore.ts` in `frontend/src/store/`
- New `BotPanel.tsx` in `frontend/src/components/panels/`
- Backend: new REST endpoints `/api/bot/status`, `/api/bot/config`, `/api/bot/positions`, `/api/bot/trades`, `/api/bot/signals` + WebSocket channels

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-frontend-bot-dashboard*
*Context gathered: 2026-02-28*
