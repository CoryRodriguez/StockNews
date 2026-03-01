# Roadmap: StockNews — Autonomous Trading Bot

**Milestone:** Autonomous Trading Bot
**Created:** 2026-02-27
**Depth:** Comprehensive
**Coverage:** 47/47 v1 requirements mapped

---

## Phases

- [x] **Phase 1: Bot Infrastructure Foundation** - Database schema, bot controller lifecycle, startup position reconciliation (completed 2026-02-28)
- [x] **Phase 2: Signal Engine** - News evaluation pipeline in log-only mode with deduplication and staleness protection (completed 2026-02-28)
- [x] **Phase 3: Trade Executor and Position Monitor** - Paper-mode order placement and automated exit state machine (completed 2026-02-28)
- [x] **Phase 4: Risk Management Enforcement** - Circuit breakers, PDT guard, position sizing, daily stat resets (completed 2026-03-01)
- [ ] **Phase 5: Frontend Bot Dashboard** - UI panel for bot status, live P&L, controls, and signal rejection log
- [ ] **Phase 6: Live Trading Mode** - Gate-based live API unlock with mode-switch safeguards

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Bot Infrastructure Foundation | 3/3 | Complete   | 2026-02-28 |
| 2. Signal Engine | 4/4 | Complete   | 2026-02-28 |
| 3. Trade Executor and Position Monitor | 5/5 | Complete   | 2026-02-28 |
| 4. Risk Management Enforcement | 4/4 | Complete   | 2026-03-01 |
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

**Plans**: 01-01 (DB Schema), 01-02 (Bot Controller), 01-03 (REST Routes + Wiring)

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

**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — BotSignalLog schema + @anthropic-ai/sdk install + config constants
- [x] 02-02-PLAN.md — signalEngine.ts core evaluation gauntlet (steps 1-11, AI placeholder)
- [x] 02-03-PLAN.md — Claude AI evaluation branch + hook into all 3 news services
- [x] 02-04-PLAN.md — Automated verification suite + human verification checkpoint

---

### Phase 3: Trade Executor and Position Monitor

**Goal**: The bot places paper-mode buy orders on qualifying signals, confirms fills in real time, and automatically exits positions using hard stop, profit target, and time limit rules — with full crash recovery.

**Depends on**: Phase 2

**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXIT-01, EXIT-03, EXIT-04, EXIT-05, EXIT-06

**Success Criteria** (what must be TRUE):
  1. When the signal engine fires a qualifying signal, a market buy order is placed on the Alpaca paper API using star-rating dollar-notional sizing (5-star=$100, 4-star=$75, 3-star=$50 from BotConfig; 1-2 star = skip), and the news handler is never blocked waiting for the order to complete
  2. Fill confirmation arrives via the Alpaca trading WebSocket stream (not polling); partial fills are reconciled against `GET /v2/positions/{symbol}` so the tracked position quantity always matches the broker's actual quantity
  3. Every order rejection from Alpaca is logged with the rejection reason, and the bot continues operating without crashing
  4. An open position is automatically closed when any of the following is true: price drops to the hard stop loss threshold from entry, profit target is reached, or max hold duration elapses
  5. At 3:45 PM ET every trading day, all open positions are force-closed regardless of P&L — no positions are held overnight
  6. On server restart with open positions in the database, the position monitor resumes watching those positions immediately without requiring a new buy signal

**Plans**: 5 plans

Plans:
- [x] 03-01-PLAN.md — BotConfig schema migration (tradeSizeStars3/4/5 + profitTargetPct fields)
- [x] 03-02-PLAN.md — tradeExecutor.ts + tradingWs.ts (buy-side execution + WebSocket fill events)
- [x] 03-03-PLAN.md — positionMonitor.ts (5s exit loop + EOD cron + addPosition interface)
- [x] 03-04-PLAN.md — Wiring: signalEngine + botController + index.ts integration
- [x] 03-05-PLAN.md — Automated verification suite + human verification checkpoint

---

### Phase 4: Risk Management Enforcement

**Goal**: The bot enforces limits on concurrent positions, PDT day-trade count, and per-symbol concentration, implements trailing stop exit logic, and resets daily counters automatically each morning.

**Depends on**: Phase 3

**Requirements**: RISK-01 (removed per user decision), RISK-02, RISK-03, RISK-04, RISK-05, EXIT-02

**Note**: RISK-01 (daily P&L circuit breaker) was removed per user decision in CONTEXT.md. Risk management approach is fast-entry + tight exits (trailing stop + hard stop), not aggregate daily limits.

**Success Criteria** (what must be TRUE):
  1. (RISK-01 REMOVED) No daily P&L circuit breaker — risk is managed per-trade via trailing stop and hard stop
  2. When the number of concurrently open positions equals or exceeds the configured maximum, new buy signals are rejected and logged as 'max-positions' in BotSignalLog
  3. Before every live-mode buy order, the bot checks the Alpaca account's `daytrade_count`; if placing the trade would exceed 3 day trades in the current 5-day window, the order is blocked and a rejected BotTrade record is written with exitReason='pdt_limit'
  4. At 4:00 AM ET each trading day, in-memory daily state is reset automatically via node-cron — no manual intervention required
  5. A ticker with an already-open position cannot receive a new buy order — the bot rejects signals for symbols it already holds with 'already-holding' in BotSignalLog
  6. (EXIT-02) Trailing stop wired into positionMonitor.ts: configurable by percentage (trailingStopPct) or dollar amount (trailingStopDollar) via BotConfig; percentage takes precedence when both set; fires after hard stop check, before profit target check

**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md — Schema migration (trailingStopPct + trailingStopDollar) + BotConfigRecord update
- [x] 04-02-PLAN.md — Risk gates: RISK-02 (max-positions) + RISK-05 (already-holding) in signalEngine.ts; RISK-03 (PDT) in tradeExecutor.ts
- [x] 04-03-PLAN.md — Trailing stop (EXIT-02) + 4AM reset cron (RISK-04) + getOpenPositionCount/getOpenSymbols exports in positionMonitor.ts
- [x] 04-04-PLAN.md — Automated verification suite + human checkpoint

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
| EXIT-02 | Phase 4 |
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
*Last updated: 2026-03-01 — Phase 4 COMPLETE (4/4 plans); all risk gates verified; advancing to Phase 5*
