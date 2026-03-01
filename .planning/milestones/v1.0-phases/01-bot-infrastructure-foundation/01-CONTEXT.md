# Phase 1: Bot Infrastructure Foundation - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the persistence layer and lifecycle controller that all subsequent phases plug into. Delivers: three DB tables (BotTrade, BotConfig, BotDailyStats), a bot controller service, startup position reconciliation, and lifecycle REST endpoints. No signal evaluation, no order placement — those are Phase 2 and Phase 3.

</domain>

<decisions>
## Implementation Decisions

### DB Schema — BotConfig
- Store ALL configurable fields in Phase 1: enabled flag, paper/live mode, position size (USD), confidence multipliers (high/med/low), max concurrent positions, daily loss limit, min win rate threshold, hard stop loss %, max hold duration, catalyst tier enablement, 5 Pillars thresholds (max float, max price, min relative volume)
- Reason: avoids schema migrations when later phases need to read these values; they can just read from BotConfig immediately

### DB Schema — BotTrade
- Define the full schema now, even though Phase 1 won't insert records: symbol, entry price, exit price, shares, P&L, catalyst type, catalyst tier, exit reason, status (open/closed/missed), Alpaca order ID, timestamps (entry, exit, created)
- Trade recording starts when paper trading begins (Phase 3)
- Purpose of capturing all fields now: accumulate data to analyze which catalyst keywords/tiers produce profitable trades and which exit signals work — this data feeds the strategy engine

### DB Schema — BotDailyStats
- Tracks daily P&L, trade count, day trade count per calendar date
- Used by circuit breakers and PDT guard in Phase 4

### Lifecycle State Machine
- States: `stopped`, `running`, `paused`
- **Pause semantics**: no new buy signals, but continue monitoring and exiting open positions — positions are never left unattended when paused
- **Stop semantics**: halt all activity (no new buys, no position monitoring)
- On server restart: restore last known state from BotConfig — if it was running before restart, it resumes running; if stopped, stays stopped

### Startup Reconciliation
- On every server startup, compare DB open positions against Alpaca's live position endpoint
- If a DB position no longer exists at Alpaca (e.g., closed manually while server was down): mark it as status = `missed` with a reconciliation note — preserve the data for analysis rather than deleting
- No frontend alert for reconciled-missing positions — this should be rare as server restarts during trading hours are not expected
- Bot is a server-side background process; it runs independently of whether the browser/frontend is open

### REST API Shape
- Individual action endpoints: `POST /api/bot/start`, `POST /api/bot/pause`, `POST /api/bot/resume`, `POST /api/bot/stop`
- Each endpoint persists the new state to BotConfig before returning
- `GET /api/bot/status` returns a full snapshot: bot state, mode (paper/live), open position count, today's realized P&L, today's trade count, market open flag

### Claude's Discretion
- Bot controller code structure (class, singleton, module-level export — pick whatever fits the existing service pattern)
- Exact Prisma schema field types and constraints
- How the controller is initialized and registered in Express app startup

</decisions>

<specifics>
## Specific Ideas

- The user intends minimal server restarts during trading hours; reconciliation edge cases are a safety net, not a primary flow
- Trade data accumulation starts in Phase 3 and is expected to grow over time — schema should be forward-compatible with future analytics
- The "missed" trade status preserves data about would-have-been trades during downtime, which is useful for retrospective analysis

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 1 scope.

</deferred>

---

*Phase: 01-bot-infrastructure-foundation*
*Context gathered: 2026-02-27*
