# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — Autonomous Trading Bot

**Shipped:** 2026-03-01
**Phases:** 7 | **Plans:** 29 | **Timeline:** 3 days (2026-02-27 → 2026-03-01)

### What Was Built

- Bot infrastructure: crash-safe state machine, BotTrade/BotConfig/BotDailyStats persistence, Alpaca startup reconciliation
- Signal engine: 10-step evaluation gauntlet covering tier classification, win-rate gate, 5 Pillars (float/price/rel-vol), cross-source dedup, stale-article rejection, 30s reconnect cooldown, and Claude AI evaluation for tier-3/4 headlines
- Paper trade executor + position monitor: notional-dollar orders, Alpaca trading WebSocket fill confirmation, 5-second exit loop (hard stop / trailing stop / profit target / time limit), EOD force-close at 3:45 PM ET
- Risk management: max concurrent positions gate, per-symbol cooldown, PDT guard (daytrade_count check before every live buy), 4 AM daily reset cron
- BotPanel React dashboard: real-time status, live P&L, trade history, signal rejection log, 19-field config editor, PDT counter, gate progress display
- Live trading gate: goLiveGate.ts evaluates 30-trade/40%-win/5-clean-day criteria; explicit UI confirmation dialog before mode switch
- EOD recap system: eodRecap.ts computes 0-100 score, suggestions, SPY/QQQ benchmarks, self-period comparisons; RecapPage with Recharts Day/Week/Month views; BotPanel 5th Recap tab with badge dot

### What Worked

- **GSD phased execution**: Each phase built on the previous cleanly — Phase 1's persistence layer was available for Phase 2 signal logging without rework. The dependency ordering was exactly right.
- **Verification scripts per phase**: Writing a bash check script (10-45 checks) at the end of each phase caught integration gaps immediately rather than accumulating them. 45/45, 28/28, 24/24 etc. gave high confidence.
- **Fire-and-forget pattern**: Making signal evaluation never block the news handler (void executeTradeAsync().catch()) was decided early and avoided a class of potential bugs throughout Phase 3-4.
- **BotConfig singleton pattern**: @id @default("singleton") at schema level eliminated application-layer enforcement entirely — clean and reliable.
- **Claude AI as tier-3/4 guard**: Treating Claude as a filter for ambiguous headlines (not all headlines) kept API cost low while adding meaningful signal quality for edge cases.

### What Was Inefficient

- **Phase 7 RECAP requirements not in REQUIREMENTS.md**: Phase 7 (EOD Recap) was added to the roadmap after the requirements file was written, so its requirements (RECAP-SCHEMA, RECAP-MISSED-OPP, etc.) existed only in ROADMAP.md. This created a tracking gap — next milestone, add all new phase requirements to REQUIREMENTS.md from the start.
- **STATE.md accumulated historical entries**: STATE.md accumulated previous execution state snapshots on every update, making it very long. A cleanup pass was needed.
- **summary-extract one_liner field not populated**: Phase SUMMARY.md files didn't include a `one_liner:` field in their YAML front matter, so gsd-tools accomplishment extraction returned empty. Writing one-liners manually took extra time.

### Patterns Established

- **Verification script per phase** (`scripts/phaseXX-checks.sh`): bash grep + tsc --noEmit + prisma validate combination; save to scripts/ for future reference
- **Plan-level atomic commits**: every task within a plan gets its own feat() commit; docs() commit follows with SUMMARY.md, STATE.md, ROADMAP.md updates
- **Signal gauntlet structure**: evaluateBotSignal() — check bot state → market hours → staleness → reconnect cooldown → dedup → win rate → risk gates → 5 Pillars → AI eval → fire. Each step short-circuits with a logged reason.
- **Position monitor as leaf service**: positionMonitor.ts imports nothing from tradeExecutor or tradingWs; prevents circular deps; monitor is a pure watchdog

### Key Lessons

1. **Persistent seenIds for news dedup**: Docker restarts replay articles as "new" — dedup keyed on (symbol, normalized title) in the BotSignalLog table rather than in-memory is the correct solution.
2. **Reconcile positions on every startup**: Never assume DB state matches Alpaca broker state. reconcilePositions() is non-fatal (server starts even if Alpaca unreachable) but essential for crash safety.
3. **PDT check must be live API call**: The daytrade_count field in Alpaca's account object is the authoritative source — local counting will drift. Always call GET /v2/account before each live buy.
4. **Trailing stop race condition**: sold=true must be set *before* the first await in closePosition() to prevent concurrent poll cycles from firing duplicate sell orders.
5. **Recharts Formatter typed as (val: number | undefined)**: Recharts v3 passes undefined to Tooltip Formatter — plan examples often assume number-only, but TS2322 will surface on compilation.
6. **SUMMARY.md one_liner field**: Add `one_liner: "..."` to every SUMMARY.md YAML front matter so gsd-tools can extract accomplishments automatically at milestone completion.

### Cost Observations

- Model mix: Primarily claude-sonnet-4-6 (balanced profile) for planning + execution agents
- Sessions: ~15 working sessions across 3 days
- Notable: YOLO mode with comprehensive depth + parallel execution delivered 7 phases/29 plans in 3 days with no rework phases required

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 7 |
| Plans | 29 |
| Days | 3 |
| Files changed | 125 |
| Net lines added | +26,513 |
| Requirements met | 46/47 |
| Verification checks | 134/134 |
