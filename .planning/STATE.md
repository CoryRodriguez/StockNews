---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: Phase 1 — Bot Infrastructure Foundation
current_plan: 01-02 (ready to execute)
status: In Progress
last_updated: "2026-02-28T03:17:00.000Z"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 3
  completed_plans: 1
---

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
**Current Plan:** 01-02 — botController.ts Singleton (ready to execute)
**Status:** In Progress — 1/3 plans complete

```
Progress: ██░░░░░░░░░░░░░░░░░░  5%

Phase 1: Bot Infrastructure Foundation  [1/3] In Progress (01-01 done, 01-02 next)
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
| 1. Bot Infrastructure Foundation | INFRA-01 to INFRA-08 (8) | Planned (3 plans) | - |
| 2. Signal Engine | SIG-01 to SIG-11 (11) | Not started | - |
| 3. Trade Executor and Position Monitor | EXEC-01 to EXEC-07, EXIT-01 to EXIT-06 (13) | Not started | - |
| 4. Risk Management Enforcement | RISK-01 to RISK-05 (5) | Not started | - |
| 5. Frontend Bot Dashboard | UI-01 to UI-07 (7) | Not started | - |
| 6. Live Trading Mode | LIVE-01 to LIVE-03 (3) | Not started | - |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 6 |
| Phases complete | 0 |
| Requirements total | 47 |
| Requirements delivered | 0 |
| Plans created | 3 |
| Plans complete | 1 |

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
| enabledCatalystTiers as String "1,2,3,4" | Prisma Int[] defaults have edge cases; String is simple, callers parse with .split(",").map(Number) |
| BotConfig singleton via @id @default("singleton") | Enforces single-row constraint at schema level; no application logic needed |
| status/exitReason as String not enum | Avoids migration churn if values need expanding; documented in schema comments |
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

**Last session:** 2026-02-28T03:17:00.000Z
**Next action:** Execute Plan 01-02 — botController.ts singleton

### Handoff Notes

Plan 01-01 complete — DB schema migration done:
- **01-01** (DONE): BotTrade, BotConfig, BotDailyStats added to schema.prisma + migration SQL created
- **01-02** (NEXT): botController.ts singleton — state machine, reconciliation, getAlpacaBaseUrl(), mode guard
- **01-03** (PENDING): REST routes (bot.ts) + index.ts wiring — /start, /pause, /resume, /stop, /status endpoints

Plan 01-01 commits: 7fe590a (schema models), c6859b2 (migration SQL), 4cb0f4a (prisma generate)
Key: enabledCatalystTiers stored as String "1,2,3,4"; BotConfig singleton id; prisma validate passes

---

*State initialized: 2026-02-27*
*Last updated: 2026-02-27 — Added SIG-10 (5 Pillars), SIG-11 (Claude AI classification), EXEC-07 (confidence-tiered sizing)*
