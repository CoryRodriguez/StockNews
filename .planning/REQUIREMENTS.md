# Requirements: StockNews — Autonomous Trading Bot

**Defined:** 2026-02-27
**Core Value:** The bot must catch fast catalyst-driven price moves the moment they happen and act on them automatically — because these moves occur too quickly for manual reaction.

---

## v1 Requirements

### Bot Infrastructure

- [ ] **INFRA-01**: System stores bot trade lifecycle in a persistent database table (BotTrade) so positions survive server restarts
- [ ] **INFRA-02**: System stores bot configuration (enabled, mode, thresholds) in a persistent database table (BotConfig) so settings survive restarts
- [ ] **INFRA-03**: System stores daily trading statistics (daily P&L, trade count, day trade count) in a persistent table (BotDailyStats) for circuit breaker persistence
- [ ] **INFRA-04**: Bot reconciles open positions against Alpaca's live position data on every server startup before accepting new signals
- [ ] **INFRA-05**: Bot can be enabled or disabled via a persistent kill switch that survives server restarts
- [ ] **INFRA-06**: Bot exposes REST endpoints for start, pause, resume, and stop operations
- [ ] **INFRA-07**: Bot supports paper trading mode and live trading mode, switched via configuration
- [ ] **INFRA-08**: Mode switch from paper to live is blocked when any positions are currently open

### Signal Engine

- [ ] **SIG-01**: Bot evaluates incoming news articles from RTPR, Benzinga, and Alpaca News feeds for trade signals
- [ ] **SIG-02**: Bot filters signals by catalyst tier — only processes categories with sufficient historical win rate data
- [ ] **SIG-03**: Bot uses strategy engine win-rate data to gate signals (configurable minimum win rate threshold, default ≥50%)
- [ ] **SIG-04**: Bot deduplicates signals across news sources — same catalyst event arriving from multiple sources within 5 minutes triggers at most one trade evaluation
- [ ] **SIG-05**: Bot rejects articles older than 90 seconds at time of evaluation (stale news protection)
- [ ] **SIG-06**: Bot suppresses signal evaluation for 30 seconds after any news source WebSocket reconnect
- [ ] **SIG-07**: Bot logs every evaluated signal with outcome (fired, rejected, reason) for audit and threshold calibration
- [ ] **SIG-08**: Bot operates in log-only mode initially (signals evaluated and logged, no orders placed) until explicitly enabled
- [ ] **SIG-09**: Bot suppresses new buy signals during the opening auction window (9:30–9:45 AM ET)
- [ ] **SIG-10**: Bot validates Warrior Trading 5 Pillars before allowing a signal to proceed — confirms float < 20M shares, share price < $20, and relative volume ≥ 5x 30-day average (uses existing Alpaca snapshot data; configurable thresholds)
- [ ] **SIG-11**: Bot uses a hybrid classification pipeline — tier 1–2 catalyst matches proceed immediately; tier 3–4 and unclassified headlines are sent to Claude API with 5 Pillars context to evaluate whether a trade is warranted before proceeding

### Trade Execution

- [ ] **EXEC-01**: Bot places market buy orders on Alpaca paper trading API when signal conditions are met
- [ ] **EXEC-02**: Bot confirms order fills via Alpaca trading WebSocket stream (real-time, not polling)
- [ ] **EXEC-03**: Bot handles partial fills correctly — reconciles position quantity from Alpaca's position endpoint after every fill event
- [ ] **EXEC-04**: Bot logs and handles all Alpaca order rejection scenarios without crashing
- [ ] **EXEC-05**: Bot uses dollar-notional position sizing (configurable dollar amount per trade, e.g., $500) rather than fixed share quantity
- [ ] **EXEC-06**: Bot fires trade execution asynchronously — news handler is never blocked waiting for order placement
- [ ] **EXEC-07**: Bot applies confidence-tiered position sizing — tier 1–2 signals (or AI-confirmed high confidence) apply a configurable multiplier to the base position size (default 2×); tier 3–4 use 1×; AI-confirmed low confidence uses 0.5×

### Position Exit

- [ ] **EXIT-01**: Bot applies a hard stop loss (configurable %, default -7% from entry) that triggers immediately regardless of peak price
- [ ] **EXIT-02**: Bot applies a trailing stop loss that trails peak price (uses strategy engine's per-category trailing stop percentage)
- [ ] **EXIT-03**: Bot applies a profit target exit (uses strategy engine's per-category hold duration and performance data)
- [ ] **EXIT-04**: Bot applies a time-based forced exit (configurable max hold duration, default from strategy engine per catalyst type)
- [ ] **EXIT-05**: Bot force-closes all open positions at 3:45 PM ET every trading day (before market close) using node-cron
- [ ] **EXIT-06**: Bot monitors open positions via price polling every 5 seconds using existing price tracking infrastructure

### Risk Management

- [ ] **RISK-01**: Bot halts all new trade entries when cumulative realized P&L for the day falls below a configured daily loss limit (e.g., -$500)
- [ ] **RISK-02**: Bot rejects new trade entries when the number of concurrently open positions meets or exceeds a configured maximum (e.g., 3)
- [ ] **RISK-03**: Bot checks Alpaca day trade count before every live buy and blocks the trade if it would exceed 3 day trades in the current 5-day window (PDT protection) for accounts under $25,000
- [ ] **RISK-04**: Bot resets daily statistics (P&L, trade count) at 4:00 AM ET each trading day via scheduled job
- [ ] **RISK-05**: Bot enforces a per-ticker cooldown — no new entry in a symbol that already has an open position

### Bot Dashboard (Frontend)

- [ ] **UI-01**: Dashboard includes a Bot Panel displaying current bot status (running, paused, stopped, market closed)
- [ ] **UI-02**: Bot Panel displays all currently open positions with live P&L updating in real time
- [ ] **UI-03**: Bot Panel displays a log of recent bot trades (entry price, exit price, P&L, exit reason, catalyst type)
- [ ] **UI-04**: Bot Panel provides pause, resume, and emergency stop controls
- [ ] **UI-05**: Bot Panel provides a configuration UI for: enabled catalyst tiers, position size (USD), confidence multipliers (high/med/low), max concurrent positions, daily loss limit, min win rate threshold, hard stop loss %, max hold duration, 5 Pillars thresholds (max float, max price, min relative volume)
- [ ] **UI-06**: Bot Panel displays the current PDT day-trade counter and remaining day trades
- [ ] **UI-07**: Bot Panel displays a signal rejection log showing evaluated-but-rejected signals with rejection reasons

### Live Trading

- [ ] **LIVE-01**: Bot supports switching to Alpaca live trading API via a configuration change with no code changes
- [ ] **LIVE-02**: Live mode switch requires explicit confirmation in the UI and is blocked if any positions are open
- [ ] **LIVE-03**: System meets the go-live gate before live trading is enabled: 30+ completed paper trades, ≥40% win rate, 5 consecutive trading days without unhandled exceptions

---

## v2 Requirements

### Advanced Signal Intelligence

- **SIG-V2-01**: Confidence-gated signal thresholds — categories with high uncertainty require higher win rate to trade
- **SIG-V2-02**: VWAP-relative entry filter — block entries when price is more than 15% above current VWAP
- **SIG-V2-03**: Bracket orders for M&A plays — extract deal price from headline, use as take-profit ceiling

### Advanced Position Management

- **EXIT-V2-01**: Float-aware position sizing — smaller float stocks get smaller positions due to liquidity risk
- **EXIT-V2-02**: Volatility-adjusted sizing — reduce position size on high-volatility catalyst categories

### Analytics

- **ANALYTICS-V2-01**: Bot trade analytics feed back into strategy engine to improve win-rate estimates
- **ANALYTICS-V2-02**: Slippage tracking — compare paper fill price vs actual bid/ask at fill time for live calibration
- **ANALYTICS-V2-03**: Per-category performance dashboard showing bot win rate vs manual trade win rate

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Options trading | Fundamentally different risk profile and execution complexity; separate project |
| Short selling | Opposite direction of catalyst plays; requires margin account confirmation |
| Multi-broker support | Alpaca-only by design; abstract interface is a future concern |
| Kelly criterion position sizing | Requires large sample size (300+ trades per category); start with fixed notional |
| ML/NLP model training | Strategy engine is empirical, not ML-based; training pipelines add complexity — Claude API classification (SIG-11) is inference-only, not model training |
| Multi-symbol backtesting | Beyond the scope of the strategy engine's current design |
| Mobile app | Desktop-first; responsive web only |
| Social/chat features | Personal single-user tool |

---

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |
| INFRA-07 | Phase 1 | Pending |
| INFRA-08 | Phase 1 | Pending |
| SIG-01 | Phase 2 | Pending |
| SIG-02 | Phase 2 | Pending |
| SIG-03 | Phase 2 | Pending |
| SIG-04 | Phase 2 | Pending |
| SIG-05 | Phase 2 | Pending |
| SIG-06 | Phase 2 | Pending |
| SIG-07 | Phase 2 | Pending |
| SIG-08 | Phase 2 | Pending |
| SIG-09 | Phase 2 | Pending |
| SIG-10 | Phase 2 | Pending |
| SIG-11 | Phase 2 | Pending |
| EXEC-01 | Phase 3 | Pending |
| EXEC-02 | Phase 3 | Pending |
| EXEC-03 | Phase 3 | Pending |
| EXEC-04 | Phase 3 | Pending |
| EXEC-05 | Phase 3 | Pending |
| EXEC-06 | Phase 3 | Pending |
| EXEC-07 | Phase 3 | Pending |
| EXIT-01 | Phase 3 | Pending |
| EXIT-02 | Phase 3 | Pending |
| EXIT-03 | Phase 3 | Pending |
| EXIT-04 | Phase 3 | Pending |
| EXIT-05 | Phase 3 | Pending |
| EXIT-06 | Phase 3 | Pending |
| RISK-01 | Phase 4 | Pending |
| RISK-02 | Phase 4 | Pending |
| RISK-03 | Phase 4 | Pending |
| RISK-04 | Phase 4 | Pending |
| RISK-05 | Phase 4 | Pending |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |
| UI-04 | Phase 5 | Pending |
| UI-05 | Phase 5 | Pending |
| UI-06 | Phase 5 | Pending |
| UI-07 | Phase 5 | Pending |
| LIVE-01 | Phase 6 | Pending |
| LIVE-02 | Phase 6 | Pending |
| LIVE-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 47 total
- Mapped to phases: 47
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after adding 5 Pillars gate (SIG-10), Claude AI classification (SIG-11), confidence-tiered sizing (EXEC-07)*
