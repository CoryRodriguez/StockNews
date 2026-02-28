# Project Research Summary

**Project:** StockNews — Autonomous Trading Bot Milestone
**Domain:** Catalyst-driven momentum day trading bot (Alpaca Markets, Node.js)
**Researched:** 2026-02-27
**Confidence:** HIGH

## Executive Summary

The autonomous trading bot is not a greenfield build — it is an additive milestone on top of a mature, already-functional Day Trade Dashboard. The heavy lifting (news ingestion, catalyst classification, strategy engine, paper trading execution, scanner integration, price tracking, analytics) is already implemented. The bot milestone adds four new layers on top: a signal gate that decides WHEN to auto-fire (not yet built), a risk manager with circuit breakers (not yet built), a live-trading mode switch (architectural, trivial code change), and a bot control UI panel. This framing drives the entire phase structure: the team is wiring existing components together under automated control, not building a trading system from scratch.

The recommended approach is strictly additive with minimal new dependencies. Only one new package is warranted (`node-cron` for market hours scheduling). The existing raw-fetch Alpaca client, `ws` WebSocket library, Prisma/PostgreSQL, and Docker Compose are all sufficient. The bot runs inside the existing Express process — no subprocess, no worker threads, no message queue. Three new database models (BotTrade, BotConfig, BotDailyStats) provide crash-recovery-safe persistence. Paper mode and live mode share identical code; only the Alpaca base URL differs.

The dominant risks are regulatory and operational, not architectural. The Pattern Day Trader rule can lock the account for 90 days with a single misstep. Stale news (especially after WebSocket reconnects) can trigger buys at the top of an already-expired move. Positions held in memory vanish on server crash. All three risks have known, implementable mitigations that must be built before any live trading. The research is clear: the bot must prove itself in paper mode with a defined go-live gate (30+ trades, 40%+ win rate, 5+ clean days) before live funds are risked.

---

## Key Findings

### Recommended Stack

The stack requires essentially zero new infrastructure. The existing Node.js/Express/TypeScript/Prisma/PostgreSQL/Docker Compose stack handles everything. The only new dependency is `node-cron` for declarative market hours scheduling (daily circuit breaker reset at 4 AM ET, forced position close at 4 PM ET). All Alpaca interactions continue through native `fetch` and `ws` — the same pattern used throughout the codebase and already verified against Alpaca's official API documentation.

**Core technologies:**
- `native fetch` (existing): Alpaca REST order placement, position queries, account checks — zero new deps, proven pattern
- `ws` v8 (existing): Alpaca trading WebSocket stream for real-time fill notifications — replaces slow 2-second polling in current `waitForFill()`
- `node-cron` v3 (new, lightweight): Market hours guard, daily circuit breaker reset — the only new install
- Prisma + PostgreSQL (existing): Bot state persistence, crash recovery, daily P&L tracking
- Docker Compose (existing): Restart-on-crash already handled; no additional process manager needed

**Packages explicitly NOT to add:** Alpaca SDK (stale, no gain over existing raw-fetch), XState (37KB for 5 bot states), Bull/BullMQ (requires Redis, massively overengineered), Python risk libraries (wrong language).

**Alpaca paper vs live:** Identical API surface; only the base URL changes. One `config.botMode` flag switches between them. Paper API credentials and live API credentials are separate (different secrets), but the header format and all endpoints are identical. Trailing stops are NOT supported inside Alpaca bracket orders — exit logic must remain in the position monitor.

### Expected Features

The research identified 10 table-stakes features, a clear go-live gate, and an explicit list of features to defer. The must-have set is unusually well-defined because the existing codebase makes dependencies concrete.

**Must have (table stakes — paper mode launch):**
- Hard stop loss — currently absent; trailing stop only activates after peak > entry; hard stop prevents silent holding through a reversal
- Daily max loss circuit breaker — P0 risk control; sum today's PnL from DB, halt if below threshold
- Max concurrent positions limit — prevent correlated exposure on simultaneous catalyst bursts
- Signal gate with configurable tier/win-rate thresholds — the core new logic; wires catalystClassifier + strategyEngine into an auto-fire decision
- Bot enable/disable control — persistent kill switch (DB-stored, not env var); must survive restarts
- Position sizing by dollar notional — fixed share count is broken for multi-price-range stocks; use Alpaca `notional` parameter
- Bot status WebSocket broadcast — reuse existing `clientHub.ts` broadcast infrastructure for real-time UI updates
- Bot control UI panel — visibility into what the bot is doing; required for paper validation

**Should have (live mode readiness — phase 2):**
- Paper to live mode switch with explicit UI confirmation and guard against switching with open positions
- Order fill retry logic — retry sell failures up to 3x, then alert
- Confidence-gated signal thresholds — uses accumulated paper trade data; low-confidence categories require higher win rate
- VWAP-relative entry filter — block entries when price is extended >15% above VWAP; data already captured
- Signal rejection log — audit every evaluated-but-rejected signal for threshold calibration

**Defer (v2+):**
- Bracket orders for M&A plays (requires deal price extraction from headline — complex NLP)
- Float-aware position sizing (requires float data source not currently integrated)
- Per-category strategy override UI (useful once data accumulates)
- Options, short selling, Kelly criterion, ML/NLP, multi-symbol backtesting — explicit non-goals

**Go-live gate:** 30+ successful paper trades, win rate >= 40%, no unhandled exceptions for 5+ consecutive trading days, circuit breaker manually tested, hard stop manually tested.

### Architecture Approach

The bot integrates as a set of modules initialized inside the existing Express process at server startup. The architecture is a linear pipeline: news event arrives → `botSignalEngine` evaluates (catalyst tier, win rate, risk gate) → `tradeExecutor` places order → `positionMonitor` manages exit loop → `riskManager` tracks daily P&L. All components broadcast status events to the existing `clientHub` for real-time frontend updates. No new infrastructure layers are introduced.

**Major components:**
1. `botSignalEngine.ts` — evaluates incoming news articles against tier filter, strategy engine win rate, and risk gate; emits `TradeSignal` (fire-and-forget, non-blocking)
2. `tradeExecutor.ts` — places Alpaca buy/sell orders, tracks order state through fill confirmation, persists `BotTrade` records; own state, separate from `paperTrader.ts`
3. `positionMonitor.ts` — per-position exit state machine (trailing stop, hard stop, profit target, time limit); polls via existing `getSnapshots()`; loaded from DB on restart for crash recovery
4. `riskManager.ts` — daily P&L accumulator with circuit breaker, concurrent position counter, position sizing calculator; persisted in `BotDailyStats`
5. `botController.ts` — lifecycle management (start/pause/resume/stop), REST endpoints, startup reconciliation via `GET /v2/positions`
6. Three new Prisma models: `BotTrade`, `BotConfig`, `BotDailyStats` — no changes to existing models

**Critical separation:** Signal engine must not block on order execution (fire-and-forget pattern). Position monitor must not share state with the existing `paperTrader.ts` (separate DB tables, separate position maps). Mode switch (paper to live) is only permitted when zero positions are open.

### Critical Pitfalls

1. **Pattern Day Trader (PDT) rule violation** — A bot trading multiple catalyst signals in a morning can exhaust the 3-day-trade-per-5-days limit and lock the account for 90 days. Mitigation: check `daytrade_count` from `GET /v2/account` before every buy; hard-gate new buys when count >= 3 for accounts under $25k; display PDT counter prominently in UI. Must be built before any live trading.

2. **Stale news triggers trades at the top** — WebSocket reconnects replay recent articles; Docker container restarts make all session news appear "new"; articles with old timestamps are delivered via slow APIs. Mitigation: persist `seenIds` to DB (hydrate from last 4 hours on startup); add `MAX_ARTICLE_AGE_SECONDS = 90` check; suppress signal evaluation for 30 seconds after any WebSocket reconnect. Must be built before paper trading begins.

3. **Server crash with open positions** — In-memory position state is wiped on container restart; bot does not know it holds shares; may re-buy the same symbol, doubling unintended exposure. Mitigation: persist all positions to `BotTrade` table before any API call; on startup, call `reconcilePositions()` against Alpaca `GET /v2/positions` as the first action before starting signal listeners.

4. **Ghost fills and partial fills** — Small-cap market orders often generate multiple partial fill events; fill state tracked from WebSocket events diverges from actual broker state; orphaned sell-side monitors fire for wrong quantities. Mitigation: never trust WebSocket fill events alone — always reconcile with `GET /v2/positions/{symbol}` after any fill event; track `qty_filled` vs `qty_ordered`.

5. **Runaway bot from duplicate signals** — Same news article arrives from RTPR, Benzinga, and Alpaca News within 500ms with different article IDs; bot evaluates each independently and places three buy orders. Mitigation: cross-source deduplication keyed on `(symbol, catalyst_type, article_date_truncated_to_minute)` with a 5-minute suppression window; serialize signal evaluation per ticker.

6. **Overnight position accumulation** — Day orders for exit protection expire at 4:00 PM ET; a buy at 3:55 PM holds overnight with no protection; gap-downs on next open can be catastrophic for catalyst stocks. Mitigation: force-close all open positions at 3:45 PM ET via `node-cron`; alert if any positions cannot be closed; re-apply exit logic on next-day open for any surviving positions.

7. **Pre-market and opening auction entry** — Market orders before 9:30 AM are rejected unless `extended_hours: true` is set; opening auction (9:30–9:45 AM) produces the worst fill prices of the session. Mitigation: suppress new buys during 9:30–9:45 AM ET window; treat pre-market orders as limit-only with `extended_hours: true`; use proper `America/New_York` timezone (DST-aware) for all market hours logic.

---

## Implications for Roadmap

Based on combined research, a 6-phase structure emerges from the dependency graph. Later phases literally cannot function without earlier ones being stable.

### Phase 1: Bot Infrastructure Foundation

**Rationale:** Before any signal evaluation or order placement, the three new DB models, the bot controller lifecycle, and the startup reconciliation must exist. This is the skeleton everything else attaches to.
**Delivers:** Database migration (BotTrade, BotConfig, BotDailyStats); `botController.ts` with start/pause/stop REST endpoints; `GET /api/bot/status`; startup position reconciliation against Alpaca; `riskManager.ts` skeleton (counters, no enforcement yet)
**Addresses features:** Bot enable/disable control (table stakes #6); Paper vs live mode switch architecture
**Avoids pitfalls:** Crash-and-lose-positions (Pitfall 3) — reconciliation is built from day one; PDT counter groundwork (Pitfall 1)

### Phase 2: Signal Engine

**Rationale:** The signal engine is the gating layer. It must exist and be validated in log-only mode (no orders placed) before any money — paper or live — is involved. Validation means confirming it correctly filters, deduplicates, and classifies signals.
**Delivers:** `botSignalEngine.ts` wired into `rtpr.ts` and `benzinga.ts`; catalyst tier filter; strategy engine win-rate gate; cross-source deduplication; stale article age check; reconnect suppression; signal evaluation logging; sentiment blocklist for negative catalyst false positives
**Addresses features:** Catalyst signal gate (table stakes #1); danger pattern integration
**Avoids pitfalls:** Stale news trades (Pitfall 2); duplicate signals (Pitfall 10); false positive catalyst buys (Pitfall 14); timezone DST bugs (Pitfall 13)

### Phase 3: Trade Executor and Position Monitor (Paper Mode)

**Rationale:** With signal engine validated, the order execution layer is added in paper-mode-only. This phase introduces actual order placement against the paper Alpaca API and the exit state machine.
**Delivers:** `tradeExecutor.ts` (market buy, fill confirmation with partial fill handling, DB persistence); `positionMonitor.ts` (trailing stop + hard stop + profit target + time limit exit loop, crash recovery via DB load on startup); Alpaca trading WebSocket stream subscription for real-time fill events; bot:trade and bot:position broadcast channels; order rejection handling for all Alpaca error codes
**Addresses features:** Hard stop loss (table stakes #2); exit strategy implementation (table stakes #8); order fill confirmation (table stakes #9); bot status broadcast (table stakes #10)
**Avoids pitfalls:** Ghost fills (Pitfall 4); order rejections silently ignored (Pitfall 11); overnight positions (Pitfall 12 — force-close at 3:45 PM ET); pre-market/auction entries (Pitfall 8)

### Phase 4: Risk Management Enforcement

**Rationale:** Risk controls are initially logged (Phase 1 skeleton), then enforced after the signal and executor are verified. This sequencing lets the team observe what would-have-been-blocked before the guardrails are live, reducing the chance of over-blocking valid signals.
**Delivers:** Daily max loss circuit breaker with `node-cron` daily reset; max concurrent positions enforcement; position sizing by dollar notional (using Alpaca `notional` parameter); PDT day-trade counter with hard gate; `BotDailyStats` daily date rollover; cross-position deduplication (one position per symbol at a time)
**Addresses features:** Daily max loss circuit breaker (table stakes #3); max concurrent positions (table stakes #4); position sizing algorithm (table stakes #5)
**Avoids pitfalls:** PDT rule violation (Pitfall 1); runaway bot compounding losses (Pitfall 5); market halt cascading losses (Pitfall 6 mitigation via position size limits)

### Phase 5: Frontend Bot Dashboard Panel

**Rationale:** Paper trading validation requires human visibility. The bot dashboard is built after the backend pipeline is functional so the UI accurately reflects real bot state rather than mocked state.
**Delivers:** Bot status indicator (running/paused/stopped/market-closed); active positions table with live P&L ticking from position monitor; recent bot trades log with entry/exit/PnL/reason; pause/resume/emergency-stop controls; config panel (enabled tiers, position size, max positions, daily loss limit); PDT counter display; signal rejection log viewer
**Addresses features:** Bot control UI panel; bot status broadcast consumption; confidence-gated signal thresholds (display); VWAP entry filter (display)
**Avoids pitfalls:** No visibility into runaway bot (Pitfall 5 — human can see and intervene); wash sale warning display (Pitfall 9)

### Phase 6: Live Trading Mode

**Rationale:** Live mode is unlocked only after the go-live gate criteria are met in paper mode. The code change is trivial (one URL change); the gate criteria ensure the bot has proven reliability.
**Delivers:** Live API URL in config; `BotConfig.mode` switch with guard (no switch if positions open); UI confirmation dialog for mode switch; slippage simulation added to paper fills for pre-live calibration; `ALPACA_LIVE_API_KEY` / `ALPACA_LIVE_API_SECRET` environment variables added to Docker Compose; integration test with minimal live order ($1 notional)
**Addresses features:** Paper to live mode switch (table stakes #7); slippage reality check (Pitfall 15)
**Avoids pitfalls:** Accidental live trading during paper validation (Pitfall 5 variant); cross-account position mismatch on mode switch (ARCHITECTURE anti-pattern 5)

### Phase Ordering Rationale

The order is strictly dependency-driven:
- Infrastructure (Phase 1) must precede everything because the DB schema, bot controller, and reconciliation logic are load-bearing for crash recovery
- Signal engine (Phase 2) must be validated in log-only mode before orders are placed — this is the primary risk surface for buying stale news or duplicate signals
- Executor and monitor (Phase 3) build on a validated signal layer, so false-positive signal fires are already corrected before real orders are placed
- Risk enforcement (Phase 4) is sequenced after the execution path is working in paper mode — this allows observation of would-have-been-blocked situations before enforcement goes live, preventing over-filtering
- UI (Phase 5) is built after the backend state is stable and accurate, preventing the team from building UI against mocked state that changes
- Live mode (Phase 6) is gated behind proven paper performance — not a time-boxed milestone, but a gate-based unlock

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Trade Executor):** Partial fill handling edge cases and Alpaca order update WebSocket event schema need careful implementation — the official documentation covers the happy path but edge cases (partial fill + cancel, bracket order leg fills) should be traced against the Alpaca v2 API reference before coding
- **Phase 6 (Live Trading):** Live Alpaca credentials, live account setup, and regulatory confirmation (is the account margin or cash?) need verification before implementation; live order behavior may differ subtly from paper in edge cases not covered by docs

Phases with standard patterns (skip research-phase):
- **Phase 1 (Infrastructure):** Standard Prisma migration + Express routing — fully established patterns, no research needed
- **Phase 2 (Signal Engine):** All integration points already mapped; wiring existing services (catalystClassifier, strategyEngine) is mechanical
- **Phase 4 (Risk Management):** Simple arithmetic checks (daily P&L sum, position count) — no novel patterns
- **Phase 5 (Frontend Dashboard):** React component consuming existing WebSocket channels — standard pattern for this codebase

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing codebase fully inspected; Alpaca API verified against official docs; one new dependency (node-cron) verified on npm |
| Features | HIGH | Table stakes derived from existing code gaps (what's missing is concrete); differentiators derived from existing analytics fields already in schema |
| Architecture | HIGH | Existing service boundaries and integration points read from source code directly; Alpaca WebSocket and bracket order specs verified from official docs |
| Pitfalls | HIGH | PDT rule and wash sale are established regulatory law; Alpaca-specific pitfalls verified from official API docs; operational pitfalls (crash recovery, duplicate signals) grounded in concrete codebase analysis |

**Overall confidence: HIGH**

### Gaps to Address

- **Actual Alpaca live account type (cash vs margin):** Margin accounts have different day trading rules (4:1 intraday buying power, maintenance margin calls). The research assumes a standard margin account. Verify before Phase 6.
- **Alpaca rate limits (current):** The research cites ~200 requests/minute for the trading API. This should be verified against current Alpaca documentation before implementing the Phase 3 request queue, as limits change.
- **Strategy engine warm-up period:** The strategy engine provides low-confidence recommendations until 50+ trades per category accumulate. The signal gate's minimum win rate threshold (0.5 default) may block most trades initially. Plan for a manual override period during Phase 2 paper validation.
- **Slippage quantification:** Paper fills do not simulate slippage. The go-live gate requires a slippage model (Phase 6), but the specific slippage percentages (0.5–2% cited) are estimates. Real slippage on small-cap catalyst plays should be validated during paper trading by comparing fill prices to bid/ask spreads at fill time.
- **VWAP data availability in real time:** The `getVwapDev()` function is in the codebase but its data source and freshness during the bot's 5-second position monitor cycle should be confirmed before relying on it as a signal gate criterion in Phase 2.

---

## Sources

### Primary (HIGH confidence)
- `c:/Projects/StockNews/backend/src/` — full source code read; defines existing integration points, data models, and service boundaries
- docs.alpaca.markets/docs/paper-trading — paper vs live URL difference, credential format, behavior differences
- docs.alpaca.markets/docs/orders-at-alpaca — order types, bracket orders, trailing stop limitations
- docs.alpaca.markets/docs/websocket-streaming — trading WebSocket stream, order update event schema, authentication format
- docs.alpaca.markets/reference/getaccount-1 — account fields: `daytrade_count`, `pattern_day_trader`, `daytrading_buying_power`
- SEC/FINRA Rule 4210 — PDT rule (3 day trades in 5 business days; <$25k equity)
- IRS Section 1091 — Wash sale rule (30-day re-entry window)

### Secondary (MEDIUM confidence)
- Practitioner consensus on catalyst exit timing — FDA approval peaks within 15-60 min; M&A anchors near deal price; Earnings slower 1-4 hours. Strategy engine is designed to empirically validate these.
- node-cron v3.0.3 — training data; current version should be confirmed on npm before install

### Tertiary (LOW confidence)
- Alpaca order rejection codes and specific error messages — verified from API patterns; exact error string format should be confirmed against current Alpaca API reference before implementing the order rejection handler in Phase 3

---
*Research completed: 2026-02-27*
*Ready for roadmap: yes*
