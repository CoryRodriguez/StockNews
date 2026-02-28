---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03
current_plan: Not started
status: completed
last_updated: "2026-02-28T22:57:04.103Z"
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 12
  completed_plans: 12
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03-trade-executor
current_plan: 03-03 (not started)
status: executing
last_updated: "2026-02-28T19:44:55.821Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 12
  completed_plans: 11
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03-trade-executor
current_plan: 03-02 (not started)
status: executing
last_updated: "2026-02-28T19:35:09.632Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 12
  completed_plans: 8
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 02
current_plan: Not started
status: completed
last_updated: "2026-02-28T17:27:05.866Z"
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 7
  completed_plans: 7
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 03-trade-executor
current_plan: 03-02 (not started)
status: Phase 3 In Progress — Plan 03-01 Complete
last_updated: "2026-02-28T19:36:00Z"
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
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

**Current Phase:** 03
**Current Plan:** Not started
**Status:** Milestone complete

```
Progress: ████████████░░░░░░░░  58%

Phase 1: Bot Infrastructure Foundation  [3/3] COMPLETE
Phase 2: Signal Engine                  [4/4] COMPLETE
Phase 3: Trade Executor + Position Mon  [5/5] COMPLETE
Phase 4: Risk Management Enforcement   [ ] Not started
Phase 5: Frontend Bot Dashboard         [ ] Not started
Phase 6: Live Trading Mode              [ ] Not started
```

---

## Phase Summary

| Phase | Requirements | Status | Completed |
|-------|-------------|--------|-----------|
| 1. Bot Infrastructure Foundation | INFRA-01 to INFRA-08 (8) | COMPLETE (3 plans) | 2026-02-27 |
| 2. Signal Engine | SIG-01 to SIG-11 (11) | COMPLETE (4 plans) | 2026-02-28 |
| 3. Trade Executor and Position Monitor | EXEC-01 to EXEC-07, EXIT-01 to EXIT-06 (13) | COMPLETE (5 plans) | 2026-02-28 |
| 4. Risk Management Enforcement | RISK-01 to RISK-05 (5) | Not started | - |
| 5. Frontend Bot Dashboard | UI-01 to UI-07 (7) | Not started | - |
| 6. Live Trading Mode | LIVE-01 to LIVE-03 (3) | Not started | - |

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 6 |
| Phases complete | 2 |
| Requirements total | 47 |
| Requirements delivered | 19 |
| Plans created | 12 |
| Plans complete | 12 (3 in Phase 1, 4 in Phase 2, 5 in Phase 3) |

---
| Phase 03 P04 | 3 | 2 tasks | 3 files |
| Phase 03 P05 | ~10 | 2 tasks | 1 file |

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
| getAlpacaBaseUrl() falls back to paper URL when botConfig null | Safe before initBot() completes — no null pointer on early calls |
| reconcilePositions() non-fatal | Server must start even if Alpaca unreachable outside market hours or with bad keys |
| switchMode() guard at service layer | Prevents mode changes with open positions regardless of which route calls it (INFRA-08) |
| initBot() after recomputeStrategies() in startup | Strategy win-rate data must be warm before bot processes Phase 2 signals; order enforced in server.listen callback |
| GET /status has no state guard | UI always polls regardless of bot state; must always succeed; snapshot shape used by Phase 5 dashboard |
| claudeSignalModel hardcoded in config.ts | Model version is a code decision, not deployment config; single place to update when Anthropic releases new Haiku |
| anthropicApiKey falls back to empty string | Server starts cleanly without Claude key; signal engine handles missing key as "ai-unavailable" outcome |
| Silent skips write no BotSignalLog record | Bot-not-running, market-closed, and dedup cases are silent — keeps audit log clean and queryable |
| appConfig alias for ../config import | Prevents shadowing of local getBotConfig() result inside evaluateBotSignal; TypeScript would silently use wrong variable without alias |
| 2s timeout at Anthropic client constructor | SDK throws on timeout; catch in evaluateWithAI returns null cleanly without needing Promise.race() |
| getAnthropicClient() check after aiResult===null | Distinguishes ai-unavailable (null client) from ai-timeout (catch returned null) without a separate flag variable |
| evaluateBotSignal unconditional in news services | Signal engine evaluates all articles regardless of paper trade state; evaluateBotSignal outside activeScanners guard |
| Dedup keyed on symbol+normalizedTitle | Not createdAt — catches the same story re-published by multiple sources within the 5-minute window |
| Empty getSnapshots() treated as failed price pillar | Guards against API outages causing false signals; safer to reject than to fire without price data |
| Win-rate bypass when sampleSize === 0 | No historical data yet should not block all signals; winRateAtEval logged as null for transparency |
| tradeSizeStars3=$50, tradeSizeStars4=$75, tradeSizeStars5=$100 flat-dollar defaults | Star-rating sizing uses fixed USD amounts per tier, not a multiplier of positionSizeUsd |
| profitTargetPct=10 default | 10% profit target exit threshold from CONTEXT.md locked-in decisions |
| BotConfigRecord interface updated with schema in same commit | Prevents TypeScript drift before prisma generate regenerates the client |
| BotTrade created on order placement not fill | Position tracked even if trading WebSocket loses connection between order and fill |
| partial_fill calls GET /v2/positions/{symbol} for authoritative qty | Never trust WebSocket partial fill qty alone (EXEC-03 pitfall avoidance) |
| tradingWs message handler is async void + .catch | Prevents unhandled promise rejection if fill dispatch throws; WS handler itself stays synchronous |
| restartTradingWs uses 100ms setTimeout after close | Allows socket state machine to fully reset before new connection attempt |
| Position monitor leaf service — no executor or ws imports | Prevents circular dependency; monitor is purely a watchdog, not an orchestrator |
| sold=true set before first await in closePosition | Race condition guard: any concurrent poll cycle sees sold=true and returns before any duplicate sell |
| Position monitor always active after import | setInterval starts at module load — monitor runs even when bot is paused, protecting all open positions |
| EOD cron uses America/New_York timezone | DST-correct scheduling via node-cron timezone option; 3:45 PM ET correct year-round |
| void executeTradeAsync().catch() in signalEngine | Fire-and-forget ensures news handler is never blocked on order placement (EXEC-06) |
| rejectReason=null (not "log-only") in fired writeSignalLog | Signal is genuinely fired now — log-only was Phase 2 placeholder |
| reconcilePositions() imports orphan Alpaca positions | Creates BotTrade + calls addPosition() for any open Alpaca position not in DB |
| switchMode() calls restartTradingWs() | Trading WebSocket reconnects to correct URL immediately after paper/live mode change |
| startTradingWs() before startPositionMonitor() in startup | Trading stream starts connecting before monitor begins first poll cycle |

### Architecture Notes

- Signal pipeline: news event → botSignalEngine (tier + win-rate + risk gate) → tradeExecutor (async) → positionMonitor (exit loop)
- All bot state broadcast via existing clientHub.ts infrastructure
- Paper vs live mode: identical code paths; only Alpaca base URL differs
- Position monitor polls every 5 seconds using existing getSnapshots() infrastructure
- Startup reconciliation: on every server start, reconcilePositions() calls GET /v2/positions before enabling signal listeners
- BotSignalLog: permanent audit record for every news article evaluated by the signal engine (outcome: fired/rejected/skipped)

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

- User must add ANTHROPIC_API_KEY to backend/.env and docker-compose.yml

### Blockers

- None

---

## Session Continuity

**Last session:** 2026-02-28T22:57:04.102Z
**Next action:** Phase 4 — Risk Management Enforcement (RISK-01 to RISK-05)

### Handoff Notes

Phase 1 complete — all 3 plans delivered:
- **01-01** (DONE): BotTrade, BotConfig, BotDailyStats added to schema.prisma + migration SQL created
- **01-02** (DONE): botController.ts singleton — state machine, reconciliation, getAlpacaBaseUrl(), mode guard, config.alpacaLiveUrl
- **01-03** (DONE): REST routes (bot.ts) + index.ts wiring — /start, /pause, /resume, /stop, /status endpoints + initBot() call

Phase 2 complete (all 4 plans):
- **02-01** (DONE): BotSignalLog model + migration SQL + @anthropic-ai/sdk + config.anthropicApiKey + config.claudeSignalModel
- **02-02** (DONE): signalEngine.ts — full 10-step evaluation gauntlet with BotSignalLog writes; evaluateBotSignal() + notifyReconnect() exported
- **02-03** (DONE): Claude AI evaluation for tier 3-4 + evaluateBotSignal hooked into rtpr, alpacaNews, benzinga; notifyReconnect in rtpr + alpacaNews
- **02-04** (DONE): Automated verification suite (prisma validate, tsc --noEmit, grep pattern checks) + human checkpoint approved

Plan 01-01 commits: 7fe590a (schema models), c6859b2 (migration SQL), 4cb0f4a (prisma generate)
Plan 01-02 commits: 04cae2f (config.alpacaLiveUrl), 270c70f (botController.ts)
Plan 01-03 commits: df03042 (routes/bot.ts), 218dffc (index.ts wiring)
Plan 02-01 commits: 0c61852 (BotSignalLog schema + migration), cd65f51 (SDK + config constants)
Plan 02-02 commits: ca3b780 (signalEngine.ts — full gauntlet)
Plan 02-03 commits: f502426 (Claude AI evaluation), 32e68e7 (news service hooks)
Plan 02-04 commits: e6ea4a8 (automated verification suite — all 6 checks pass)
Key: Phase 2 signal engine complete and verified. All articles from all 3 feeds route through evaluateBotSignal. Tier 3-4 uses Claude API (ai-unavailable/ai-timeout/ai-declined/fired). Phase 3 wired real order submission — rejectReason="log-only" is fully removed.

Phase 3 complete — all 5 plans delivered:
- **03-01** (DONE): Added tradeSizeStars3/4/5 + profitTargetPct to BotConfig schema.prisma, BotConfigRecord interface, and migration SQL 20260228000002
  - Commits: 8812123 (schema + interface), 80af4df (migration SQL)
- **03-02** (DONE): tradeExecutor.ts (buy order + BotTrade lifecycle) + tradingWs.ts (Alpaca trading WebSocket)
  - Commits: 0df1919 (tradeExecutor.ts), f370f91 (tradingWs.ts)
- **03-03** (DONE): positionMonitor.ts — 5s exit loop, hard stop / profit target / time exit / EOD cron at 3:45 PM ET
  - Commits: 16931ed (positionMonitor.ts + node-cron install)
- **03-04** (DONE): Integration wiring — signalEngine fires executeTradeAsync, reconcilePositions hydrates positionMonitor, startTradingWs+startPositionMonitor in index.ts
  - Commits: d08b25b (signalEngine.ts), 475d515 (botController.ts + index.ts)
- **03-05** (DONE): Verification suite (13/13 checks pass) + human checkpoint approved — Phase 3 complete
  - Commits: 6fb3a3a (automated verification suite)

---

*State initialized: 2026-02-27*
*Last updated: 2026-02-28 — Phase 3 complete (all 5 plans); bot places paper-mode orders end-to-end, 13/13 verification checks pass, human-approved; Phase 4 (Risk Management) is next*
