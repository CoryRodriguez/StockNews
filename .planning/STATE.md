---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 05-frontend-bot-dashboard
current_plan: 05-04 complete
status: executing
stopped_at: Completed 05-04-PLAN.md
last_updated: "2026-03-01T09:24:28Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 22
  completed_plans: 20
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 04
current_plan: Not started
status: completed
stopped_at: Completed 05-01-PLAN.md
last_updated: "2026-03-01T09:17:21.906Z"
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 21
  completed_plans: 18
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 04-risk-management-enforcement
current_plan: 04-03 (not started)
status: executing
stopped_at: Completed 04-03-PLAN.md
last_updated: "2026-03-01T00:01:47.435Z"
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 16
  completed_plans: 15
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 04-risk-management-enforcement
current_plan: 04-02 (not started)
status: executing
stopped_at: Completed 04-02-PLAN.md
last_updated: "2026-03-01T00:01:16.865Z"
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 16
  completed_plans: 14
---

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

**Current Phase:** 05-frontend-bot-dashboard
**Current Plan:** 05-05 complete — Phase 5 COMPLETE
**Status:** Phase 5 Complete — Advancing to Phase 6

```
Progress: █████████████████████  95%

Phase 1: Bot Infrastructure Foundation  [3/3] COMPLETE
Phase 2: Signal Engine                  [4/4] COMPLETE
Phase 3: Trade Executor + Position Mon  [5/5] COMPLETE
Phase 4: Risk Management Enforcement   [4/4] COMPLETE
Phase 5: Frontend Bot Dashboard         [5/5] COMPLETE
Phase 6: Live Trading Mode              [ ] Not started
```

---

## Phase Summary

| Phase | Requirements | Status | Completed |
|-------|-------------|--------|-----------|
| 1. Bot Infrastructure Foundation | INFRA-01 to INFRA-08 (8) | COMPLETE (3 plans) | 2026-02-27 |
| 2. Signal Engine | SIG-01 to SIG-11 (11) | COMPLETE (4 plans) | 2026-02-28 |
| 3. Trade Executor and Position Monitor | EXEC-01 to EXEC-07, EXIT-01 to EXIT-06 (13) | COMPLETE (5 plans) | 2026-02-28 |
| 4. Risk Management Enforcement | RISK-01 to RISK-05, EXIT-02 (6) | COMPLETE (4 plans) | 2026-03-01 |
| 5. Frontend Bot Dashboard | UI-01 to UI-07 (7) | COMPLETE (5/5 plans) | 2026-03-01 |
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
| Phase 04 P02 | 88 | 2 tasks | 3 files |
| Phase 04 P03 | 7 | 2 tasks | 1 files |
| Phase 04 P04 | 3 | 2 tasks | 1 file |
| Phase 05 P02 | 5 | 2 tasks | 2 files |
| Phase 05-frontend-bot-dashboard P05-01 | 4 | 2 tasks | 4 files |

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
| trailingStopPct and trailingStopDollar default 0 = disabled | Trailing stop does not fire unless > 0; pct takes precedence over dollar when both set |
| getOpenPositionCount/getOpenSymbols exported from positionMonitor.ts in plan 04-02 | Wave 2 parallelism — both plans needed the exports; adding in 04-02 ensures tsc passes regardless of 04-03 completion order |
| checkPdtLimit fails open on API error | Alpaca maintenance windows must not freeze all trades; logging covers the gap |
| PDT check skipped in paper mode | Paper account is >$25k by design; PDT rule doesn't apply (CONTEXT.md locked decision) |
| already-holding check moved from tradeExecutor to signalEngine | BotSignalLog captures full article context (headline, source, catalystCategory) at upstream rejection point |
| writeSignalLog() returns created record (not void) | Enables id-based WS broadcasts without a second DB read; null return on error keeps call sites clean |
| broadcastRejectedSignal() no-op on null input | Guards against DB write failures at all 11 rejection sites without try/catch per-call |
| setBotState broadcast sends lightweight snapshot (zeros) | Full status requires async DB queries incompatible with post-update sync flow; frontend hydrates via GET /status on mount |
| BotPanel.tsx stub created in 05-03 (not deferred to 05-04) | tsc passes immediately; stub is preferred per plan; 05-04 replaces with full component |
| subscribedRef.current.clear() on 'connected' message | Pre-existing bug: channels did not re-subscribe after WebSocket reconnect because set was never cleared; fix in 05-03 |
| bot-1 panel at x:0 y:28 w:6 h:20 | Left column below both scanner panels; gives bot dashboard prominent vertical space |
| Graceful P&L degradation in PositionRow | watchlistStore.prices[symbol]?.price ?? entryPrice — avoids subscribeQuoteChannel complexity; $0 unrealized until ticker added to watchlist |
| StatusBadge resolves market_closed when running but !marketOpen | Bot can be running while market is closed (weekend); badge shows distinct state |
| pdtResetDay() uses America/New_York timezone | DST-correct next business day for PDT reset display in status tab |

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

**Last session:** 2026-03-01T09:29:00Z
**Stopped at:** Completed 05-05-PLAN.md — Phase 5 COMPLETE
**Next action:** Phase 6 — Live Trading Mode (LIVE-01, LIVE-02, LIVE-03)

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

Phase 4 COMPLETE — All 4 plans delivered and verified:
- **04-01** (DONE): Added trailingStopPct + trailingStopDollar to BotConfig schema.prisma, BotConfigRecord interface, initBot() defaults, and migration SQL 20260228000003
  - Commits: 3a52fb6 (schema + interface), b6d157b (migration SQL)
- **04-02** (DONE): RISK-02 (max positions), RISK-05 (per-symbol), RISK-03 (PDT) gates added to signalEngine.ts and tradeExecutor.ts; positionMonitor.ts exports getOpenPositionCount/getOpenSymbols
  - Commits: c4c93de (signalEngine.ts + positionMonitor.ts stubs), 9b95639 (tradeExecutor.ts PDT guard)
- **04-03** (DONE): positionMonitor.ts EXIT-02 trailing stop wired into checkExitConditions() (pct/dollar precedence); RISK-04 4AM daily reset cron; cronsScheduled duplicate guard; tsc passes
  - Commits: b9f98e1 (positionMonitor.ts)
- **04-04** (DONE): Phase 4 automated verification suite (24/24 checks pass) + human checkpoint approved — bot starts clean in paper mode
  - Commits: 4838744 (phase04-checks.sh)

Phase 5 COMPLETE — All 5 plans delivered:
- **05-01** (DONE): clientHub.ts bot channel broadcasting — setBotState, broadcastBotTradeClose, broadcastBotSignalEval; GET /api/bot/status snapshot shape aligned with UI
  - Commits: (see 05-01-SUMMARY.md)
- **05-02** (DONE): botStore.ts (BotStatus, BotTrade, BotSignal, BotConfig types + Zustand store); WsMessage bot variants added to types/index.ts; PanelType includes "bot"
  - Commits: (see 05-02-SUMMARY.md)
- **05-03** (DONE): useSocket.ts wired to 'bot' channel with bot_status_update/bot_trade_closed/bot_signal_evaluated handlers; subscribedRef reconnect bug fixed; BotPanel stub + Dashboard.tsx case "bot" + DEFAULT_PANELS bot-1 entry
  - Commits: c422a7f (useSocket.ts), da9c76f (BotPanel stub + Dashboard + dashboardStore)
- **05-04** (DONE): BotPanel full implementation — four tabs (status/history/signals/config), 19 BotConfig fields, control buttons, PDT counter, live P&L via watchlistStore.prices, Promise.all hydration
  - Commits: 43fdc8c (BotPanel.tsx full implementation)
- **05-05** (DONE): Phase 5 automated verification suite (24/24 checks pass) + human visual approval confirmed — all UI-01 through UI-07 requirements satisfied
  - Commits: 3d08533 (phase05-checks.sh)

*State initialized: 2026-02-27*
*Last updated: 2026-03-01 — Phase 5 Plan 03 COMPLETE; bot WS channel wired; reconnect fix applied; BotPanel stub registered in dashboard*
