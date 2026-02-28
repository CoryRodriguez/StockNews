# Roadmap: StockNews — Autonomous Trading Bot

**Milestone:** Autonomous Trading Bot
**Created:** 2026-02-27
**Depth:** Comprehensive
**Coverage:** 47/47 v1 requirements mapped

---

## Phases

- [ ] **Phase 1: Bot Infrastructure Foundation** - Database schema, bot controller lifecycle, startup position reconciliation
- [ ] **Phase 2: Signal Engine** - News evaluation pipeline in log-only mode with deduplication and staleness protection
- [ ] **Phase 3: Trade Executor and Position Monitor** - Paper-mode order placement and automated exit state machine
- [ ] **Phase 4: Risk Management Enforcement** - Circuit breakers, PDT guard, position sizing, daily stat resets
- [ ] **Phase 5: Frontend Bot Dashboard** - UI panel for bot status, live P&L, controls, and signal rejection log
- [ ] **Phase 6: Live Trading Mode** - Gate-based live API unlock with mode-switch safeguards

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Bot Infrastructure Foundation | 0/? | Not started | - |
| 2. Signal Engine | 0/? | Not started | - |
| 3. Trade Executor and Position Monitor | 0/? | Not started | - |
| 4. Risk Management Enforcement | 0/? | Not started | - |
| 5. Frontend Bot Dashboard | 0/? | Not started | - |
| 6. Live Trading Mode | 0/? | Not started | - |

---

## Phase Details

### Phase 1: Bot Infrastructure Foundation

**Goal**: The bot has a stable persistence layer and a crash-safe lifecycle controller — all subsequent phases attach to this skeleton.

**Depends on**: Nothing (first phase)

**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08

**Success Criteria** (what must be TRUE):
  1. Server restart does not lose bot state — open positions, configuration, and daily statistics are all reloaded from the database on startup
  2. On startup, the bot reconciles its internal position list against Alpaca's live position endpoint and discards any positions that no longer exist in the broker account
  3. Calling the REST endpoints for start, pause, resume, and stop changes bot state persistently — a subsequent server restart preserves the last state (enabled or disabled)
  4. The bot can be configured for paper mode or live mode via a persistent setting, and a mode switch is rejected when any positions are currently open
  5. Bot status is readable via `GET /api/bot/status` at any time

**Plans**: TBD

---

### Phase 2: Signal Engine

**Goal**: The bot evaluates incoming news catalysts and logs trade signals with outcomes — without placing any orders — so signal quality can be observed and thresholds calibrated before real money is involved.

**Depends on**: Phase 1

**Requirements**: SIG-01, SIG-02, SIG-03, SIG-04, SIG-05, SIG-06, SIG-07, SIG-08, SIG-09, SIG-10, SIG-11

**Success Criteria** (what must be TRUE):
  1. When a qualifying news article arrives from RTPR, Benzinga, or Alpaca News, the bot logs a signal evaluation record showing whether it would have fired a trade and the specific reason if rejected (below win rate threshold, wrong catalyst tier, stale article, reconnect suppression, duplicate, failed 5 Pillars, AI-declined, etc.)
  2. The same catalyst event arriving from two or three news sources within 5 minutes produces exactly one signal evaluation log entry, not multiple
  3. An article timestamped more than 90 seconds before the evaluation moment is rejected with reason "stale" and no trade evaluation proceeds
  4. For 30 seconds after any news WebSocket reconnect, incoming articles are suppressed and logged with reason "reconnect-cooldown"
  5. No order is placed during Phase 2 operation — the bot operates in log-only mode regardless of signal strength
  6. Tier 1–2 catalyst articles that fail the 5 Pillars check (float > 20M, price > $20, or relative volume < 5x) are logged with reason "failed-5-pillars" and the specific pillar that failed
  7. Tier 3–4 and unclassified articles that pass the 5 Pillars check are sent to Claude API; the evaluation log records the AI's recommendation (proceed / decline) and reasoning within 2 seconds

**Plans**: TBD

---

### Phase 3: Trade Executor and Position Monitor

**Goal**: The bot places paper-mode buy orders on qualifying signals, confirms fills in real time, and automatically exits positions using hard stop, trailing stop, profit target, and time limit rules — with full crash recovery.

**Depends on**: Phase 2

**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXIT-01, EXIT-02, EXIT-03, EXIT-04, EXIT-05, EXIT-06

**Success Criteria** (what must be TRUE):
  1. When the signal engine fires a qualifying signal, a market buy order is placed on the Alpaca paper API using confidence-tiered dollar-notional sizing (2× base for tier 1–2 or AI high-confidence, 1× for tier 3–4, 0.5× for AI low-confidence), and the news handler is never blocked waiting for the order to complete
  2. Fill confirmation arrives via the Alpaca trading WebSocket stream (not polling); partial fills are reconciled against `GET /v2/positions/{symbol}` so the tracked position quantity always matches the broker's actual quantity
  3. Every order rejection from Alpaca is logged with the rejection reason, and the bot continues operating without crashing
  4. An open position is automatically closed when any of the following is true: price drops to the hard stop loss threshold from entry, trailing stop activates after peak price, profit target is reached per catalyst category, or max hold duration elapses
  5. At 3:45 PM ET every trading day, all open positions are force-closed regardless of P&L — no positions are held overnight
  6. On server restart with open positions in the database, the position monitor resumes watching those positions immediately without requiring a new buy signal

**Plans**: TBD

---

### Phase 4: Risk Management Enforcement

**Goal**: The bot enforces hard limits on daily loss, concurrent positions, PDT day-trade count, and per-symbol concentration — and resets daily counters automatically each morning.

**Depends on**: Phase 3

**Requirements**: RISK-01, RISK-02, RISK-03, RISK-04, RISK-05

**Success Criteria** (what must be TRUE):
  1. When the bot's cumulative realized P&L for the day falls below the configured daily loss limit, all new buy signal evaluations are blocked for the remainder of that trading day — no trades fire regardless of signal strength
  2. When the number of concurrently open positions equals or exceeds the configured maximum, new buy signals are rejected until an existing position closes
  3. Before every live-mode buy order, the bot checks the Alpaca account's `daytrade_count`; if placing the trade would exceed 3 day trades in the current 5-day window, the order is blocked and logged as "PDT limit reached"
  4. At 4:00 AM ET each trading day, daily P&L and trade count reset to zero automatically — the circuit breaker clears without manual intervention
  5. A ticker with an already-open position cannot receive a new buy order — the bot rejects signals for symbols it already holds

**Plans**: TBD

---

### Phase 5: Frontend Bot Dashboard

**Goal**: The user can see exactly what the bot is doing in real time — status, open positions with live P&L, trade history, and signal rejections — and can pause, resume, stop, or reconfigure the bot from the browser.

**Depends on**: Phase 4

**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07

**Success Criteria** (what must be TRUE):
  1. The dashboard displays a Bot Panel showing current bot status (running, paused, stopped, or market closed) that updates in real time without a page refresh
  2. The Bot Panel shows a live table of all currently open positions with P&L figures that tick as prices change — no manual refresh required
  3. The Bot Panel displays a scrollable log of recent completed bot trades showing entry price, exit price, P&L, exit reason, and catalyst type for each trade
  4. Clicking pause, resume, or emergency stop in the UI immediately changes bot state, and the status indicator reflects the new state within one WebSocket message cycle
  5. The configuration panel allows editing catalyst tiers, position size in USD, max concurrent positions, daily loss limit, minimum win rate threshold, hard stop %, and max hold duration — changes persist across server restarts
  6. The PDT day-trade counter and remaining day trades for the current 5-day window are visible in the panel at all times
  7. The signal rejection log shows evaluated-but-rejected signals with ticker, catalyst type, timestamp, and rejection reason so the user can see what the bot declined to trade

**Plans**: TBD

---

### Phase 6: Live Trading Mode

**Goal**: The bot can switch from paper to live Alpaca API with an explicit user confirmation — and only after the go-live gate criteria have been satisfied in paper trading.

**Depends on**: Phase 5

**Requirements**: LIVE-01, LIVE-02, LIVE-03

**Success Criteria** (what must be TRUE):
  1. The mode switch from paper to live requires no code changes — only a configuration change (Alpaca base URL and live credentials) is needed, and the bot operates identically against both APIs
  2. The UI presents an explicit confirmation dialog before switching to live mode, and the switch is blocked if any positions are currently open
  3. Live trading mode cannot be activated until the go-live gate is satisfied: at least 30 completed paper trades on record, a win rate at or above 40%, and at least 5 consecutive trading days in the system log with no unhandled exceptions

**Plans**: TBD

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| INFRA-01 | Phase 1 |
| INFRA-02 | Phase 1 |
| INFRA-03 | Phase 1 |
| INFRA-04 | Phase 1 |
| INFRA-05 | Phase 1 |
| INFRA-06 | Phase 1 |
| INFRA-07 | Phase 1 |
| INFRA-08 | Phase 1 |
| SIG-01 | Phase 2 |
| SIG-02 | Phase 2 |
| SIG-03 | Phase 2 |
| SIG-04 | Phase 2 |
| SIG-05 | Phase 2 |
| SIG-06 | Phase 2 |
| SIG-07 | Phase 2 |
| SIG-08 | Phase 2 |
| SIG-09 | Phase 2 |
| SIG-10 | Phase 2 |
| SIG-11 | Phase 2 |
| EXEC-01 | Phase 3 |
| EXEC-02 | Phase 3 |
| EXEC-03 | Phase 3 |
| EXEC-04 | Phase 3 |
| EXEC-05 | Phase 3 |
| EXEC-06 | Phase 3 |
| EXEC-07 | Phase 3 |
| EXIT-01 | Phase 3 |
| EXIT-02 | Phase 3 |
| EXIT-03 | Phase 3 |
| EXIT-04 | Phase 3 |
| EXIT-05 | Phase 3 |
| EXIT-06 | Phase 3 |
| RISK-01 | Phase 4 |
| RISK-02 | Phase 4 |
| RISK-03 | Phase 4 |
| RISK-04 | Phase 4 |
| RISK-05 | Phase 4 |
| UI-01 | Phase 5 |
| UI-02 | Phase 5 |
| UI-03 | Phase 5 |
| UI-04 | Phase 5 |
| UI-05 | Phase 5 |
| UI-06 | Phase 5 |
| UI-07 | Phase 5 |
| LIVE-01 | Phase 6 |
| LIVE-02 | Phase 6 |
| LIVE-03 | Phase 6 |

**Total v1 requirements:** 47
**Mapped:** 47/47
**Unmapped:** 0

---

*Roadmap created: 2026-02-27*
