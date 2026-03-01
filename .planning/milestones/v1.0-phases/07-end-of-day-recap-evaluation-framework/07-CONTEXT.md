# Phase 7: End-of-Day Recap & Evaluation Framework - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Aggregate each trading day's activity into a layered recap with daily scoring, expandable deep-dive sections, and multi-period historical views. Surfaces actionable suggestions, tracks missed opportunities from rejected signals, and compares performance against rolling self-averages and market benchmarks (SPY/QQQ). Lives as a summary in a new BotPanel Recap tab with a full-page /recap route for the complete view.

</domain>

<decisions>
## Implementation Decisions

### Recap structure
- Layered design: summary card at top, expandable deep-dive sections below
- Summary card shows: Daily P&L (hero metric, big green/red number), win/loss count with percentage, trade count, daily numeric score (0-100), best trade, worst trade, signal count (evaluated vs fired)
- Four expandable deep-dive sections: Trade-by-trade breakdown, Signal rejection analysis, Catalyst performance, Strategy adherence

### Trade-by-trade breakdown
- Each trade as an enriched row: symbol, catalyst type/tier, entry/exit price, P&L, exit reason, hold time
- Enriched with TradeAnalytics data: VWAP deviation at entry, peak price reached, max drawdown percentage

### Signal rejection analysis
- Histogram of rejection reasons (stale, failed-5-pillars, ai-declined, pdt-limit, etc.)
- Missed opportunities section: signals that were rejected but the stock moved favorably after rejection
- Background tracking: after rejecting a signal, watch the stock's price for 30 min via existing Alpaca snapshots
- Store peak % move in a new BotSignalLog field (postRejectPeakPct)
- Flag as missed opportunity if stock moved +5%+ after rejection

### Catalyst performance
- P&L and win rate broken down by catalyst category (FDA, earnings, M&A, etc.)
- Shows which catalyst categories made money today vs lost money

### Strategy adherence
- Compare StrategyEngine recommended hold duration vs actual hold duration for each trade
- Identify early exits (hard stop triggered before recommended hold time) and overholds
- Exit reason distribution: breakdown of profit target, trailing stop, hard stop, time limit, EOD close

### Daily scoring
- Numeric score 0-100 based on weighted composite factors (P&L, win rate, signal quality, risk compliance, strategy adherence)
- Displayed in summary card alongside P&L

### Actionable suggestions
- Surface 1-3 auto-generated observations from the day's data
- Examples: "3 signals rejected by failed-5-pillars moved +8% avg — review thresholds", "FDA trades 3/3 wins — consider increasing position size"
- Suggestions only — never auto-apply changes

### Benchmarks
- Compare today's metrics against rolling 5-day and 30-day self-averages (P&L, win rate, signal count, score)
- Compare against market benchmarks: SPY and QQQ daily performance from Alpaca
- "Above/below average day" indicator with trend arrows

### Delivery & access
- Summary view in new "Recap" tab in BotPanel (5th tab alongside Status, History, Signals, Config)
- Full detailed view on separate /recap route with all sections expanded and more room for charts
- "View full recap" link from BotPanel tab opens /recap page
- Date picker in both views to browse past days

### Data generation
- Auto-persist: cron job at ~4:01 PM ET computes and persists daily recap to a DailyRecap table for fast historical loads
- On-demand: GET /api/bot/recap?date=YYYY-MM-DD computes fresh recap from source data anytime (for intraday checks)
- Persisted recaps load instantly; on-demand recomputes for freshest data

### Notification
- Tab badge dot appears on Recap tab after 4 PM ET market close to nudge user to review
- Badge clears when Recap tab is viewed

### Historical views
- Three view modes: Day, Week, Month
- Day view: summary card + expandable sections + intraday P&L timeline chart with trade event markers
- Week view: Mon-Fri daily rows with P&L, win rate; week total and comparison to previous week
- Month view: weekly rollups with monthly total and comparison to previous month
- Period-over-period comparisons with trend indicators (arrows, percentage deltas)

### Charts & visualizations
- All chart types available: bar charts, line charts, and data tables
- Bar charts for daily P&L in week view, weekly P&L in month view (green=profit, red=loss)
- Line chart for cumulative P&L trend, win rate trend over time
- Intraday P&L timeline in day view with trade open/close markers
- User can see all visualization styles and pick their favorite in practice

### Claude's Discretion
- Charting library choice (Recharts, Chart.js, lightweight-charts, etc.)
- Exact scoring formula weights and thresholds for the 0-100 score
- Loading states and error handling
- DailyRecap table schema design
- Exact spacing, typography, and color scheme within existing Tailwind design system
- How to fetch SPY/QQQ daily performance from Alpaca (snapshot vs bars endpoint)

</decisions>

<specifics>
## Specific Ideas

- Hero metric is the daily P&L as a big color-coded number — immediate good day / bad day signal
- Missed opportunities concept: after rejecting a signal, background-track the stock's price for 30 min to surface if filters are too aggressive
- Actionable suggestions should be "coach-like" — surface patterns the user might not notice, but never change settings automatically
- Period-over-period format: "+107% P&L improvement" style deltas with trend arrows
- Badge dot on Recap tab after market close — subtle unread-notification nudge
- User wants all chart types (bar, line, table) available so they can discover which they prefer in practice
- Summary in BotPanel tab for quick glance, full /recap page for deep analysis — layered access

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BotDailyStats` model: already tracks daily realizedPnl, tradeCount, dayTradeCount per date
- `BotTrade` model: full trade lifecycle with entry/exit prices, P&L, catalystType, exitReason, timestamps
- `TradeAnalytics` model: enriched per-trade data including VWAP deviation, peak price, max drawdown, relative volume
- `PriceSnapshot` model: price at 15s/30s/60s/120s/300s/600s/900s/1800s/3600s/7200s intervals and EOD
- `BotSignalLog` model: full rejection audit trail with 16+ rejection reasons, AI confidence, win-rate-at-eval
- `StrategyEngine` service: per-category strategy recommendations with hold duration, trailing stop %, confidence, sample size
- `BotPanel.tsx`: existing 4-tab UI pattern (Status, History, Signals, Config) with tab navigation
- `useBotStore.ts`: Zustand store managing bot state, positions, trades, signals, config
- `useSocket.ts`: WebSocket subscription pattern for real-time bot updates
- `botController.ts`: `isMarketOpen()` for determining post-close badge timing; `getTodayDateET()` for date handling
- `tradeAnalytics.ts`: `getCategoryStats(category?)` retrieves completed trades with snapshots
- `alpaca.ts`: `getSnapshot(symbol)` for price data — used by missed-opportunity tracker

### Established Patterns
- BotPanel tabs: each tab fetches data on mount via REST, updates via WebSocket
- Zustand stores: one store per domain (botStore, alertStore, newsStore)
- REST endpoints: all bot endpoints under /api/bot/ (status, config, positions, trades, signals, gate)
- Tailwind CSS: existing design system with dark theme support
- Date handling: `getTodayDateET()` in botController returns "YYYY-MM-DD" in Eastern Time
- Cron scheduling: node-cron used for 3:45 PM EOD close and 4:00 AM daily reset

### Integration Points
- New "Recap" tab added to BotPanel.tsx tab array
- New /recap route in frontend router
- New GET /api/bot/recap endpoint in backend/src/routes/bot.ts
- New recap computation service (e.g., eodRecap.ts) querying BotTrade, BotSignalLog, TradeAnalytics, BotDailyStats, StrategyRule
- New DailyRecap Prisma model for persisted recaps
- New field on BotSignalLog: postRejectPeakPct for missed-opportunity tracking
- New missed-opportunity tracker service (background price watches after signal rejection)
- useBotStore extended with recap state (or new useRecapStore)
- New cron job at ~4:01 PM ET to persist daily recap and trigger badge

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-end-of-day-recap-evaluation-framework*
*Context gathered: 2026-03-01*
