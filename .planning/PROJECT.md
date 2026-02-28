# StockNews — Day Trade Dashboard

## What This Is

A self-hosted, browser-based day trading command center that consolidates real-time stock scanners, sub-second breaking news, professional TradingView charts, and an autonomous trading bot into a single unified interface. Built for a single power user (personal use), hosted on a Namecheap VPS at isitabuy.com, with zero subscription lock-in.

The platform's defining capability: an autonomous bot that watches news catalysts and scanner alerts, identifies setups with high probability of 20%+ instant price moves, and executes trades automatically — without requiring the user to be present.

## Core Value

The bot must catch fast catalyst-driven price moves the moment they happen and act on them automatically — because these moves occur too quickly for manual reaction.

## Requirements

### Validated

<!-- Already built and operational -->

- ✓ Real-time news aggregation (RTPR, Benzinga, Alpaca News) — sub-second press release delivery
- ✓ Scanner engine — alerts on news flow, gap up/down, high relative volume, momentum
- ✓ Catalyst classifier — categorizes news headlines by catalyst type (FDA, M&A, earnings, etc.)
- ✓ Paper trading simulation — manual trade entry with position tracking
- ✓ Trade analytics — P&L, hold time, VWAP entry quality, win rate by catalyst
- ✓ Strategy engine — learns rules from historical trade data
- ✓ Watchlists — real-time price tracking via Alpaca WebSocket
- ✓ TradingView Advanced Chart Widget — embedded charts with multi-timeframe support
- ✓ Dashboard layouts — drag/resize/persist panels via react-grid-layout
- ✓ Auth — JWT login, single-user
- ✓ Deployed — Docker Compose on VPS, nginx reverse proxy, SSL

### Active

<!-- The autonomous trading bot milestone -->

- [ ] Catalyst signal engine — determines which catalyst types trigger auto-buy based on historical win rate
- [ ] Autonomous trade executor — fires paper/live orders when signal conditions are met, no user action required
- [ ] Auto exit manager — monitors open positions; applies researched exit strategy (profit target, stop loss, trailing stop, time limit — to be determined by research)
- [ ] Risk manager — position sizing limits, daily max loss circuit breaker, max concurrent positions
- [ ] Alpaca live trading integration — live brokerage API, architecturally ready from day 1, paper mode first
- [ ] Bot control dashboard — UI panel to monitor bot status, view active positions, configure thresholds, pause/resume
- [ ] Exit strategy research — determine optimal exit combination (profit target %, stop loss %, trailing stop %, max hold time) using historical trade data

### Out of Scope

- Options trading — different risk profile, significant complexity; defer indefinitely
- Multi-broker support — Alpaca only for v1; abstract interface for future
- Mobile app — desktop-first, responsive web only
- Social/chat features — personal tool, not multi-user
- Level 2 order book — not needed for catalyst-driven plays
- Historical backtesting engine (beyond existing strategy engine) — v2+

## Context

**Existing platform:** The backend and frontend are substantially built. The backend has service modules for news ingestion, catalyst classification, paper trading, price tracking, and strategy learning. The frontend has a multi-panel dashboard with scanner alerts, news feed, chart, watchlist, and trades panels.

**Key technical landscape:**
- Alpaca Markets: already integrated for market data (WebSocket + REST snapshots). Alpaca also offers a live trading API using the same credentials — the transition from paper to live is architectural, not a rewrite.
- Catalyst classifier (`catalystClassifier.ts`): already categorizes news by type. The bot signal engine will build on this to assign win probability scores.
- Strategy engine (`strategyEngine.ts`): already learns rules from completed paper trades. The bot can use these learned rules as its decision criteria.
- Paper trader (`paperTrader.ts`): existing simulation engine. The autonomous executor will call this (and later the live Alpaca trading API) instead of waiting for user input.
- The exit strategy is deliberately unspecified — research + historical data will determine the optimal combination of exit conditions.

**Deployment:** Live at isitabuy.com. Backend on port 3001, frontend via nginx. Docker Compose managed. Git-based deployment (push → pull on VPS → rebuild).

## Constraints

- **Tech stack**: Node.js + Express backend, React + Vite frontend — no framework changes
- **Broker**: Alpaca only (existing API keys; paper + live accounts available)
- **Deployment**: Namecheap VPS, Docker Compose — no cloud migration
- **Market hours**: US equities, pre-market (4 AM ET) through market close (4 PM ET)
- **Single user**: no multi-tenancy required; personal tool

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Paper trading first, live trading later | Validate bot logic before risking real capital; architecture supports both | — Pending |
| Alpaca for live execution | Already integrated for data; same API for trading; no additional accounts | — Pending |
| Exit strategy via research | Don't guess — use historical trade data + domain research to determine optimal exits | — Pending |
| Extend existing strategy engine | `strategyEngine.ts` already learns from trades; bot signal engine builds on this | — Pending |
| Bot runs server-side | Autonomous execution must persist 24/7 regardless of browser connection | — Pending |

---
*Last updated: 2026-02-27 after initialization*
