# StockNews — Day Trade Dashboard

## What This Is

A self-hosted, browser-based day trading command center that consolidates real-time stock scanners, sub-second breaking news, professional TradingView charts, and a fully autonomous trading bot into a single unified interface. Built for a single power user (personal use), hosted on a Namecheap VPS at isitabuy.com, with zero subscription lock-in.

The platform's defining capability: an autonomous bot that watches news catalysts and scanner alerts, identifies setups meeting the Warrior Trading 5 Pillars (float/price/rel-vol), evaluates them with a Claude AI tier-3/4 classification pass, and executes paper (or live) trades automatically — without requiring the user to be present. A full EOD recap system scores each day's performance and tracks missed opportunities.

## Core Value

The bot must catch fast catalyst-driven price moves the moment they happen and act on them automatically — because these moves occur too quickly for manual reaction.

## Requirements

### Validated

<!-- Already built and operational — v1.0 autonomous trading bot milestone -->

- ✓ Real-time news aggregation (RTPR, Benzinga, Alpaca News) — sub-second press release delivery — pre-v1.0
- ✓ Scanner engine — alerts on news flow, gap up/down, high relative volume, momentum — pre-v1.0
- ✓ Catalyst classifier — categorizes news headlines by catalyst type (FDA, M&A, earnings, etc.) — pre-v1.0
- ✓ Paper trading simulation — manual trade entry with position tracking — pre-v1.0
- ✓ Trade analytics — P&L, hold time, VWAP entry quality, win rate by catalyst — pre-v1.0
- ✓ Strategy engine — learns rules from historical trade data — pre-v1.0
- ✓ Watchlists — real-time price tracking via Alpaca WebSocket — pre-v1.0
- ✓ TradingView Advanced Chart Widget — embedded charts with multi-timeframe support — pre-v1.0
- ✓ Dashboard layouts — drag/resize/persist panels via react-grid-layout — pre-v1.0
- ✓ Auth — JWT login, single-user — pre-v1.0
- ✓ Deployed — Docker Compose on VPS, nginx reverse proxy, SSL — pre-v1.0
- ✓ Bot infrastructure — BotTrade/BotConfig/BotDailyStats persistence, crash-safe state machine, startup reconciliation — v1.0
- ✓ Signal engine — 10-step gauntlet (tier gate, win-rate gate, 5 Pillars, cross-source dedup, stale news, Claude AI classification) — v1.0
- ✓ Paper trade executor + position monitor — notional orders, WebSocket fills, 5s exit loop (hard stop / trailing stop / profit target / time / EOD force-close) — v1.0
- ✓ Risk management — max concurrent positions, per-symbol cooldown, PDT guard, 4 AM daily reset — v1.0
- ✓ Bot dashboard (BotPanel) — real-time status, live P&L, trade history, signal rejection log, 19-field config editor, PDT counter — v1.0
- ✓ Live trading mode gate — 30+ paper trades, ≥40% win rate, 5 clean days before live unlock; explicit confirmation dialog — v1.0
- ✓ EOD recap system — daily scoring, missed-opportunity tracking, SPY/QQQ benchmarks, Recharts views, 4:01 PM cron, badge dot — v1.0

### Active

<!-- Next milestone — to be defined via /gsd:new-milestone -->

- [ ] Run bot in live mode — accumulate 30+ paper trades to satisfy go-live gate
- [ ] Monitor live performance vs paper baseline
- [ ] Calibrate signal thresholds based on live data (win rate per category, 5 Pillars tuning)

### Out of Scope

- Options trading — different risk profile, significant complexity; defer indefinitely
- Multi-broker support — Alpaca only; abstract interface for future
- Mobile app — desktop-first, responsive web only
- Social/chat features — personal tool, not multi-user
- Level 2 order book — not needed for catalyst-driven plays
- Historical backtesting engine (beyond existing strategy engine) — v2+
- Daily P&L circuit breaker (RISK-01) — design decision: per-trade risk (trailing stop + hard stop) replaces aggregate daily limits for the fast-entry/tight-exit strategy
- ML/NLP model training — Claude API for inference only, not training

## Context

**Current state (post-v1.0):** Full autonomous trading bot shipped. 125 files changed, +26,730 lines added. Backend: ~6,200 lines TypeScript. Frontend: ~5,900 lines TypeScript/TSX. Bot runs in paper mode by default; live mode unlocks after meeting go-live gate.

**Stack:** Node.js + Express (TypeScript), React 18 + Vite + Tailwind + Zustand, Prisma + PostgreSQL, Docker Compose, Alpaca Markets API (data + trading), Claude API (haiku model for signal classification), Recharts for analytics charts.

**Key services (backend/src/services/):**
- `botController.ts` — bot lifecycle state machine (stopped/running/paused), BotConfig singleton, reconciliation
- `signalEngine.ts` — 10-step evaluation gauntlet; evaluateBotSignal() hooked into rtpr/benzinga/alpacaNews
- `tradeExecutor.ts` — notional-dollar market orders on Alpaca paper API
- `tradingWs.ts` — Alpaca trading WebSocket for fill confirmation
- `positionMonitor.ts` — 5s exit loop, trailing stop, EOD force-close at 3:45 PM ET
- `goLiveGate.ts` — evaluates 30-trade/40%-win/5-day-clean criteria for live mode unlock
- `eodRecap.ts` — daily performance computation, scoring, SPY/QQQ benchmarks, 4:01 PM cron
- `missedOpportunityTracker.ts` — watches rejected signals for 30min post-rejection price movement

**Deployment:** Live at isitabuy.com. Backend port 3001, frontend via nginx. Docker Compose on Namecheap VPS. Git-based deploy (push → pull on VPS → rebuild).

**User setup needed:** ANTHROPIC_API_KEY must be added to backend/.env and docker-compose.yml for Claude AI signal classification.

## Constraints

- **Tech stack**: Node.js + Express backend, React + Vite frontend — no framework changes
- **Broker**: Alpaca only (existing API keys; paper + live accounts available)
- **Deployment**: Namecheap VPS, Docker Compose — no cloud migration
- **Market hours**: US equities, pre-market (4 AM ET) through market close (4 PM ET)
- **Single user**: no multi-tenancy required; personal tool

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Paper trading first, live trading gated | Validate bot logic before risking real capital; go-live gate = 30+ trades, 40%+ win rate, 5 clean days | ✓ Good — gate enforced in code, live mode UI blocked until criteria met |
| Alpaca for live execution | Already integrated for data; same API surface for trading; one URL change to go live | ✓ Good — paper→live is config-only (base URL change) |
| Exit strategy: hard stop + trailing stop + profit target + time limit | Research-backed combination covering all exit scenarios | ✓ Good — all four exits verified working |
| RISK-01 removed (daily P&L circuit breaker) | Fast-entry/tight-exits strategy makes aggregate daily limits redundant | ✓ Good — per-trade stops provide equivalent protection |
| Bot runs inside existing Express process | No subprocess; initialized at server startup; clientHub broadcasts state | ✓ Good — simpler ops, no inter-process comms |
| Three new DB models only | BotTrade, BotConfig, BotDailyStats — no changes to existing models | ✓ Good — clean separation, zero migration risk for existing data |
| BotConfig singleton via @id @default("singleton") | Enforces single-row constraint at schema level | ✓ Good — no application logic needed for enforcement |
| Fire-and-forget signal evaluation | News handler must never block on order placement | ✓ Good — void executeTradeAsync().catch() pattern proven |
| Claude haiku for tier 3-4 classification | Cost-efficient AI gating on the edge cases | ✓ Good — 2s timeout with ai-unavailable fallback |
| EOD recap at 4:01 PM ET via node-cron | Automatic daily record with DST-correct timezone | ✓ Good — recap persists regardless of user browser activity |
| Recharts for recap charts | Existing dependency (via recharts package install); familiar API | ✓ Good — clean bar/line charts with Tooltip and responsive containers |

---
*Last updated: 2026-03-01 after v1.0 milestone — Autonomous Trading Bot shipped*
