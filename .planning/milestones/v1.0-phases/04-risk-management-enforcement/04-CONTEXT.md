# Phase 4: Risk Management Enforcement - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

The bot enforces per-trade and per-day guardrails on every signal evaluation: max concurrent positions, PDT day-trade count (live mode only), per-symbol concentration lock, and trailing stop logic (EXIT-02). Daily counters reset automatically at 4AM ET. Risk management strategy relies on per-trade exit logic (trailing stop + hard stop) rather than aggregate daily P&L limits.

</domain>

<decisions>
## Implementation Decisions

### Daily Loss Circuit Breaker (RISK-01) — REMOVED
- No daily P&L circuit breaker. User's risk management approach is: enter on the correct news as quickly as possible, then let tight exit logic (trailing stop + hard stop) protect the position.
- Planner should NOT implement a daily loss limit or related circuit breaker logic.

### Max Concurrent Positions (RISK-02)
- Configurable via BotConfig (e.g., `maxConcurrentPositions`)
- No hardcoded default — value depends on how many high-confidence catalysts fire per day
- When open positions ≥ limit, new buy signals are rejected and logged

### PDT Enforcement (RISK-03)
- **Paper mode:** Account will be funded >$25k — PDT rule does not apply. No PDT check in paper mode.
- **Live mode:** Check Alpaca's `daytrade_count` before placing each buy order. If placing the trade would bring the count to 4+ in a 5-day window, block and log as "PDT limit reached".
- PDT enforcement is live-mode only.

### 4AM Daily Reset (RISK-04)
- Resets: daily trade count (for analytics/tracking)
- Clears any in-memory daily state
- No circuit breaker reset (RISK-01 is removed)
- Implemented via node-cron at 4:00 AM ET

### Per-Symbol Concentration (RISK-05)
- One position per ticker at a time
- If bot already holds AAPL and a new AAPL catalyst fires → reject the signal, log as "already holding {ticker}"
- Rationale: if we're already in the trade, we caught it on the original news — a second article is not a new entry opportunity

### Trailing Stop (EXIT-02)
- Both `trailingStopPct` (percentage from peak) and `trailingStopDollar` (fixed dollar from peak) configurable in BotConfig
- Runs **simultaneously** with existing hard stop loss — two independent exit triggers
- Hard stop = immediate floor for fast crashes; trailing stop = locks in gains as price rises

### Rejected Trade Logging
- Rejected signals recorded in the same trades table as executed trades, with `status = 'rejected'`
- Record must include: rejection reason (which rule fired), symbol, signal timestamp
- Include associated news article reference when the rejection is signal-based (e.g., "already holding", "max positions reached")
- For technical errors/glitches: record error details for debugging — do not silently swallow

### Claude's Discretion
- When both `trailingStopPct` and `trailingStopDollar` are configured, percentage takes precedence
- Exact Prisma schema fields for rejected trade records
- How trailing stop integrates with existing paperTrader.ts peak price tracking from Phase 3

</decisions>

<specifics>
## Specific Ideas

- Paper mode is >$25k intentionally — this allows unrestrained testing to learn which trade patterns work best before going live
- Fast entry on correct news + tight exits is the core risk philosophy, not aggregate daily limits
- Rejected trades should be visible enough to debug why signals didn't fire (not just silently dropped)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-risk-management-enforcement*
*Context gathered: 2026-02-28*
