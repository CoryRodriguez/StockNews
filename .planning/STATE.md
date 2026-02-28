# Project State: StockNews — Autonomous Trading Bot

*Single source of truth for project memory. Updated at the start and end of every working session.*

---

## Project Reference

**Core Value:** The bot must catch fast catalyst-driven price moves the moment they happen and act on them automatically — because these moves occur too quickly for manual reaction.

**Project:** StockNews — Autonomous Trading Bot milestone on top of an existing Day Trade Dashboard

**Stack:** Node.js + Express backend, React + Vite frontend, Prisma + PostgreSQL, Docker Compose, Alpaca Markets API

**Deployment:** isitabuy.com, Namecheap VPS, Docker Compose managed

---

## Current Position

**Current Phase:** Phase 1 — Bot Infrastructure Foundation
**Current Plan:** None started
**Status:** Not started

```
Progress: ░░░░░░░░░░░░░░░░░░░░  0%

Phase 1: Bot Infrastructure Foundation  [ ] Not started
Phase 2: Signal Engine                  [ ] Not started
Phase 3: Trade Executor + Position Mon  [ ] Not started
Phase 4: Risk Management Enforcement   [ ] Not started
Phase 5: Frontend Bot Dashboard         [ ] Not started
Phase 6: Live Trading Mode              [ ] Not started
```

---

## Phase Summary

| Phase | Requirements | Status | Completed |
|-------|-------------|--------|-----------|
| 1. Bot Infrastructure Foundation | INFRA-01 to INFRA-08 (8) | Not started | - |
| 2. Signal Engine | SIG-01 to SIG-09 (9) | Not started | - |
| 3. Trade Executor and Position Monitor | EXEC-01 to EXEC-06, EXIT-01 to EXIT-06 (12) | Not started | - |
| 4. Risk Management Enforcement | RISK-01 to RISK-05 (5) | Not started | - |
| 5. Frontend Bot Dashboard | UI-01 to UI-07 (7) | Not started | - |
| 6. Live Trading Mode | LIVE-01 to LIVE-03 (3) | Not started | - |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 6 |
| Phases complete | 0 |
| Requirements total | 44 |
| Requirements delivered | 0 |
| Plans created | 0 |
| Plans complete | 0 |

---

## Accumulated Context

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| Paper trading first, live trading gated | Validate bot logic before risking real capital; go-live gate = 30+ trades, 40%+ win rate, 5 clean days |
| Alpaca for live execution | Already integrated for market data; same API surface for trading; one URL change to go live |
| Exit strategy via strategy engine data | Use per-category trailing stop % and hold duration from existing strategyEngine.ts |
| Bot runs inside existing Express process | No subprocess or worker threads; initialized at server startup; clientHub broadcasts state |
| Three new DB models only | BotTrade, BotConfig, BotDailyStats — no changes to existing models |
| node-cron for scheduling | Only new dependency; handles daily reset at 4 AM ET and force-close at 3:45 PM ET |
| Fire-and-forget signal evaluation | News handler must never block on order placement; tradeExecutor runs async |

### Architecture Notes

- Signal pipeline: news event → botSignalEngine (tier + win-rate + risk gate) → tradeExecutor (async) → positionMonitor (exit loop)
- All bot state broadcast via existing clientHub.ts infrastructure
- Paper vs live mode: identical code paths; only Alpaca base URL differs
- Position monitor polls every 5 seconds using existing getSnapshots() infrastructure
- Startup reconciliation: on every server start, reconcilePositions() calls GET /v2/positions before enabling signal listeners

### Critical Pitfalls to Watch

- PDT rule: check daytrade_count before every live buy; hard-gate at 3 in 5-day window for accounts under $25k
- Stale news: MAX_ARTICLE_AGE_SECONDS = 90; 30-second reconnect suppression window
- Crash recovery: persist all positions to BotTrade before any API call; reconcile on startup
- Partial fills: never trust WebSocket fill events alone; always reconcile with GET /v2/positions/{symbol}
- Duplicate signals: cross-source dedup keyed on (symbol, catalyst_type, article_date_truncated_to_minute) with 5-minute window
- Overnight positions: force-close at 3:45 PM ET via node-cron; no positions held overnight

### Research Flags for Planning

- Phase 3: Partial fill handling edge cases and Alpaca order update WebSocket event schema need careful implementation — trace against Alpaca v2 API reference before coding
- Phase 6: Live account type (cash vs margin) must be confirmed; live order behavior may differ from paper in edge cases

### Open Questions

- Strategy engine warm-up: win rate thresholds may block most trades initially (low sample size per category); plan for manual override period during Phase 2 validation
- VWAP data freshness: confirm getVwapDev() data source and freshness during 5-second position monitor cycle before using as signal gate criterion
- Alpaca rate limits: verify current rate limits (cited ~200 req/min) against current docs before Phase 3

### Todos

- None yet

### Blockers

- None

---

## Session Continuity

**Last session:** 2026-02-27 — Roadmap created; project initialized
**Next action:** Begin Phase 1 planning with `/gsd:plan-phase 1`

### Handoff Notes

The project is at the very start of the autonomous trading bot milestone. The existing platform (news ingestion, catalyst classification, paper trading, analytics, dashboard) is fully operational. This milestone adds six new layers: DB schema + controller, signal engine, trade executor + position monitor, risk management, bot UI panel, and live mode unlock. Phase 1 starts with three Prisma model additions and botController.ts — no changes to existing models or services.

---

*State initialized: 2026-02-27*
*Last updated: 2026-02-27 — Roadmap created*
