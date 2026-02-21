# Day Trade Dashboard — Product Requirements Document (PRD) & Tech Spec

**Version:** 1.0
**Date:** 2026-02-21
**Status:** Draft

---

## 1. Executive Summary

This document defines the product requirements and technical architecture for a self-hosted **Day Trade Dashboard** — a browser-based, all-in-one trading command center inspired by Warrior Trading's *Day Trade Dash* platform.

The core differentiators of this build:
- **Real-time news** via [RTPR.io](https://www.rtpr.io/docs) WebSocket API (sub-500ms latency from Business Wire, PR Newswire, GlobeNewswire)
- **Professional charts** via the user's existing **TradingView Premium** subscription (Charting Library or Advanced Chart widget)
- **Custom scanner engine** built on Polygon.io real-time market data
- **Zero subscription lock-in** — self-hosted, fully owned

---

## 2. Goals & Non-Goals

### Goals
- Replicate the core workflow of Day Trade Dash: scanners → chart → news in one view
- Sub-second news delivery for press releases using RTPR.io
- Sub-minute chart granularity (10s, 15s, 30s, 1m, 5m) via TradingView
- Real-time scanner alerts with audio notifications
- Draggable, resizable, saveable panel layouts
- Watchlist with linked chart/news interaction
- Pre-market and market-hours scanner modes

### Non-Goals (v1)
- Live trading / brokerage order execution
- Social/chat room features
- Mobile app (responsive web only, desktop-first)
- Historical backtesting engine
- Options flow or Level 2 order book

---

## 3. User Stories

| # | As a… | I want to… | So that… |
|---|-------|------------|----------|
| 1 | Day trader | See stocks gapping up pre-market in real time | I can build my watchlist before open |
| 2 | Day trader | Get audio + visual alerts when a scanner triggers | I don't miss momentum setups |
| 3 | Day trader | Click a scanner alert to instantly load that ticker's chart | I can evaluate the setup without switching tools |
| 4 | Day trader | See breaking press releases for any stock in my scanner | I understand the catalyst driving a move |
| 5 | Day trader | View 10-second, 30-second, and 1-minute charts | I can time entries precisely during fast moves |
| 6 | Day trader | Save different layouts for pre-market vs. market open | I have the right tools visible at the right time |
| 7 | Day trader | Filter news by specific tickers or view all news in firehose mode | I can focus on what's relevant |
| 8 | Day trader | See a "freshness" badge on news items | I know which headlines are brand-new |

---

## 4. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser Client                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │   Scanners   │  │   TradingView    │  │  News Feed   │  │
│  │   Panel      │  │   Chart Panel    │  │  (RTPR.io)   │  │
│  │              │  │                  │  │              │  │
│  │ • Gap Up     │  │ • 10s / 1m / 5m  │  │ • Live press │  │
│  │ • High Vol   │  │ • Pre-configured │  │   releases   │  │
│  │ • Momentum   │  │   indicators     │  │ • Audio      │  │
│  │ • Halted     │  │ • Linked to      │  │   squawk     │  │
│  └──────┬───────┘  │   scanner click  │  │ • Freshness  │  │
│         │          └──────────────────┘  │   badges     │  │
│  ┌──────▼───────┐                        └──────────────┘  │
│  │  Watchlist   │                                           │
│  │  Panel       │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────┬───────────────────────┘
                                      │
              ┌───────────────────────▼──────────────────────┐
              │              Backend Server (Node.js)         │
              │                                              │
              │  ┌─────────────────┐  ┌──────────────────┐  │
              │  │  Scanner Engine  │  │  RTPR.io Proxy   │  │
              │  │                  │  │  WebSocket       │  │
              │  │  Polygon.io WS   │  │  (auth + fan-    │  │
              │  │  → filter rules  │  │   out to client) │  │
              │  │  → alert emit    │  │                  │  │
              │  └─────────────────┘  └──────────────────┘  │
              │                                              │
              │  ┌─────────────────┐  ┌──────────────────┐  │
              │  │  REST API        │  │  Redis Cache     │  │
              │  │  (watchlists,    │  │  (scanner state, │  │
              │  │   layouts,       │  │   ticker meta)   │  │
              │  │   settings)      │  │                  │  │
              │  └─────────────────┘  └──────────────────┘  │
              └──────────────────────────────────────────────┘
                         │                     │
              ┌──────────▼──────┐    ┌─────────▼─────────┐
              │   Polygon.io    │    │     RTPR.io        │
              │   Market Data   │    │   News Wire API    │
              │   WebSocket     │    │   WebSocket        │
              └─────────────────┘    └───────────────────┘
```

---

## 5. Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend framework | **React 18 + TypeScript** | Component model fits panel-based UI |
| Build tool | **Vite** | Fast HMR, small bundles |
| Styling | **Tailwind CSS** | Utility-first, dark-theme-friendly |
| Panel layout | **react-grid-layout** | Drag, resize, persist panel configs — same library used by many trading dashboards |
| Charts | **TradingView Advanced Charts Widget** (or Charting Library with Premium) | User already has TradingView Premium; supports sub-minute timeframes |
| News delivery | **RTPR.io WebSocket API** | Sub-500ms press release delivery |
| Market data | **Polygon.io WebSocket + REST** | Real-time trades, aggregates, reference data for scanners |
| Backend | **Node.js + Express + ws** | WebSocket proxy, scanner engine, REST API |
| State management | **Zustand** | Lightweight, no boilerplate |
| Database | **PostgreSQL** (via Prisma) | Watchlists, layouts, user settings |
| Cache / pub-sub | **Redis** | Scanner state, hot ticker metadata |
| Notifications | **Web Audio API** | In-browser audio alerts (no external dep) |
| Deployment | **Docker Compose** | Single-machine self-host |

---

## 6. Feature Specifications

### 6.1 Scanner Engine

The scanner engine runs server-side, continuously processing Polygon.io real-time data and emitting alerts to connected clients via WebSocket.

#### Scanners (Phase 1 — 8 core scanners)

| Scanner Name | Trigger Criteria |
|---|---|
| **Gap Up Pre-Market** | Gap % ≥ 5%, Price $1–$30, Volume > 50k pre-market |
| **Gap Down Pre-Market** | Gap % ≤ -5%, Price $1–$30, Volume > 50k pre-market |
| **High Relative Volume** | Relative Volume ≥ 5x 30-day avg, in last 5 min |
| **Momentum Mover** | Price change ≥ 3% in last 5 min, Volume spike |
| **New 52-Week High** | Price crosses 52-week high on elevated volume |
| **Halted Stocks** | SEC/Exchange halt notification (via Polygon halt feed) |
| **Small Float Movers** | Float < 10M shares, Price up ≥ 5% on day |
| **Big % Gainer (Day)** | Up ≥ 10% on the day, any float, any price |

#### Scanner Data Columns (per alert row)
- Ticker symbol
- Company name
- Last price
- % change (day)
- % gap (pre-market)
- Volume (today)
- Relative volume
- Float
- Market cap
- Short interest %
- News indicator icon (green dot = RTPR.io press release in last 60 min)
- Halt status badge
- Time of alert

#### Audio Alerts
- Configurable per-scanner audio file (mp3)
- Volume control per scanner
- Toggle on/off globally or per-scanner

---

### 6.2 News Feed (RTPR.io)

The news panel connects to the backend's RTPR.io WebSocket proxy. The backend maintains a single RTPR.io connection and fans out to all connected browser clients.

#### Modes
- **Firehose** — all tickers, all press releases
- **Watchlist-linked** — only tickers in the active watchlist
- **Scanner-linked** — only tickers currently appearing in any active scanner

#### News Item Display
```
┌────────────────────────────────────────────────────────┐
│  🔴 NEW  [AAPL]  09:32:14                              │
│  Apple Inc. Reports Record Q1 Revenue of $124 Billion  │
│  Source: Business Wire                                 │
│  ────────────────────────────────────────────────────  │
│  [TSLA]  09:30:58                                      │
│  Tesla Announces Voluntary Recall of 45,000 Vehicles   │
│  Source: PR Newswire                        [Expand ▼] │
└────────────────────────────────────────────────────────┘
```

Fields per item:
- Freshness badge (red "NEW" for < 2 min, fades to gray)
- Ticker symbol (clickable — loads chart + filters news)
- Timestamp (market time)
- Headline (bold)
- Wire source (Business Wire / PR Newswire / GlobeNewswire)
- Expand to show full article body

#### RTPR.io WebSocket Integration (Backend Proxy)
```
wss://ws.rtpr.io?apiKey=YOUR_KEY
→ Subscribe: {"action": "subscribe", "tickers": ["*"]}
→ Receive: article events
→ Fan out to all clients via internal WebSocket server
```

---

### 6.3 Charts (TradingView)

TradingView Advanced Charts Widget embedded in the chart panel.

#### Timeframes Available
- 10s, 15s, 30s (sub-minute, requires TradingView Premium)
- 1m, 3m, 5m, 15m, 1h, 1D

#### Pre-configured Indicator Sets
Users can save and load indicator presets. Default preset includes:
- VWAP (Volume Weighted Average Price)
- 9 EMA
- 20 EMA
- Volume bars
- Relative Volume overlay

#### Interactivity
- Clicking any scanner row or news headline loads that ticker into the chart
- "Window Group" mode: scanner, chart, and news panels are linked to the same ticker
- Multiple chart panels can be open simultaneously

#### Layout Presets
| Preset | Description |
|--------|-------------|
| Pre-Market | Scanner (gap up/down) + 1 chart + news firehose |
| Market Open | 2 scanners + 2 charts + linked news |
| Power Hour | Momentum scanner + chart + watchlist |

---

### 6.4 Watchlist

- Add/remove tickers manually or via right-click on scanner alert
- Columns: Ticker, Price, Change %, Change $, Volume, Day High, Day Low
- Click row → load chart and filter news to that ticker
- Prices update in real time via Polygon.io WebSocket streaming
- Max 50 tickers per watchlist (v1)
- Save up to 5 named watchlists

---

### 6.5 Layout Manager

- Built on **react-grid-layout**: panels are drag-and-drop, resizable
- Panel types: Scanner, Chart, News, Watchlist (can have multiples of each)
- Save up to 5 named layouts per user
- Layouts persist to database (PostgreSQL)
- Load a layout at any time from the top nav

---

## 7. Data Sources & API Integration

### 7.1 RTPR.io

| | Details |
|---|---|
| Purpose | Real-time press releases for news panel and news indicators on scanners |
| Transport | WebSocket (`wss://ws.rtpr.io`) |
| Auth | `X-API-Key` header (REST) / query param `?apiKey=` (WS) |
| Connection | 1 persistent connection per API key — proxied server-side |
| Latency | < 500ms from wire release |
| Subscription | `{"action":"subscribe","tickers":["*"]}` for firehose |
| Heartbeat | Server sends `ping` every 30s; backend responds with `pong` |

### 7.2 Polygon.io

| | Details |
|---|---|
| Purpose | Real-time trades, quotes, aggregates — feeds scanner engine |
| Transport | WebSocket (`wss://socket.polygon.io/stocks`) |
| Feeds used | `T.*` (trades), `A.*` (per-second aggregates), `AM.*` (per-minute aggregates) |
| REST | `/v2/aggs`, `/v3/reference/tickers` for fundamentals (float, shares outstanding) |
| Scanner compute | Server-side Node.js, stateful ticker map in Redis |

### 7.3 TradingView

| | Details |
|---|---|
| Purpose | Charting panel |
| Integration | Advanced Charts widget (iframe/JS embed) or full Charting Library (requires agreement with TradingView) |
| Symbol format | `NASDAQ:AAPL`, `NYSE:GME` etc. |
| Custom timeframes | Available with Premium subscription |
| Data | TradingView provides its own data feed — no separate market data needed for charts |

---

## 8. API Design (Backend)

### REST Endpoints

```
GET    /api/watchlists                  → list all watchlists
POST   /api/watchlists                  → create watchlist
PUT    /api/watchlists/:id              → update watchlist
DELETE /api/watchlists/:id              → delete watchlist

GET    /api/layouts                     → list all saved layouts
POST   /api/layouts                     → save layout
PUT    /api/layouts/:id                 → update layout
DELETE /api/layouts/:id                 → delete layout

GET    /api/scanners                    → list scanner definitions
GET    /api/scanners/:id/alerts         → get current alerts for scanner
PUT    /api/scanners/:id/config         → update scanner filter config

GET    /api/news/recent                 → last N articles (REST fallback)
GET    /api/news/ticker/:symbol         → today's articles for ticker
```

### WebSocket Events (Client ↔ Backend)

```
Client → Server:
  { type: "subscribe_scanner", scanner_id: "gap_up" }
  { type: "unsubscribe_scanner", scanner_id: "gap_up" }
  { type: "subscribe_news", mode: "firehose" | "watchlist" | "tickers", tickers: [...] }
  { type: "subscribe_quotes", tickers: ["AAPL","TSLA"] }

Server → Client:
  { type: "scanner_alert", scanner_id: "gap_up", ticker: "XYZ", data: {...} }
  { type: "scanner_clear", scanner_id: "gap_up", ticker: "XYZ" }
  { type: "news_article", ticker: "XYZ", title: "...", source: "...", body: "...", ts: 1234 }
  { type: "quote_update", ticker: "XYZ", price: 12.45, change_pct: 4.2, volume: 1200000 }
```

---

## 9. Data Models

### Watchlist
```typescript
interface Watchlist {
  id: string;
  name: string;
  tickers: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Layout
```typescript
interface Layout {
  id: string;
  name: string;
  panels: Panel[];
  createdAt: Date;
  updatedAt: Date;
}

interface Panel {
  id: string;
  type: "scanner" | "chart" | "news" | "watchlist";
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>; // scanner_id, chart symbol, news mode, etc.
}
```

### Scanner Alert
```typescript
interface ScannerAlert {
  scanner_id: string;
  ticker: string;
  price: number;
  change_pct: number;
  gap_pct?: number;
  volume: number;
  relative_volume: number;
  float?: number;
  market_cap?: number;
  short_interest?: number;
  halt_status?: string;
  has_news: boolean; // true if RTPR.io article in last 60 min
  alerted_at: Date;
}
```

### News Article
```typescript
interface NewsArticle {
  id: string;
  ticker: string;
  title: string;
  body: string;
  source: "Business Wire" | "PR Newswire" | "GlobeNewswire";
  published_at: Date;
  received_at: Date; // when RTPR.io delivered it
}
```

---

## 10. UI/UX Design Principles

- **Dark theme by default** — tradingview-style dark (#0d1117 background, #1c2127 panels)
- **Dense information layout** — small fonts for scanner rows (12px), larger for key prices
- **Color coding**: green for up, red for down, yellow/orange for halted
- **Panel headers**: draggable handle, close button, settings gear icon
- **Keyboard shortcuts**:
  - `W` — add focused ticker to watchlist
  - `N` — open news for focused ticker
  - `C` — open chart for focused ticker
  - `Esc` — deselect / close modal

---

## 11. Implementation Phases

### Phase 1 — Core Platform (MVP)
- [ ] Project scaffold (React + Vite + Tailwind + TypeScript)
- [ ] Backend server (Node.js + Express + ws)
- [ ] react-grid-layout panel system
- [ ] RTPR.io WebSocket proxy + news panel
- [ ] TradingView chart panel (Advanced Charts embed)
- [ ] Basic watchlist (manual add/remove, real-time price via Polygon.io)
- [ ] 3 core scanners: Gap Up, High Relative Volume, Momentum Mover
- [ ] Layout save/load (localStorage for v1, DB in v2)
- [ ] Audio alert system

### Phase 2 — Scanner Expansion & Polish
- [ ] All 8 scanners operational
- [ ] News-scanner linking (news indicator dots on scanner rows)
- [ ] Scanner-linked news mode (news panel auto-filters to scanner tickers)
- [ ] Pre-built layout presets (Pre-Market, Market Open, Power Hour)
- [ ] Scanner alert history (last N alerts per scanner)
- [ ] PostgreSQL persistence (watchlists, layouts, settings)

### Phase 3 — Advanced Features
- [ ] Custom scanner builder (user-defined filter rules)
- [ ] Additional sub-minute timeframes (10s, 15s)
- [ ] Multi-chart layouts (2–4 chart panels simultaneously)
- [ ] Export scanner alerts to CSV
- [ ] Alert replay / historical news review

---

## 12. Environment Variables

```env
# Backend
POLYGON_API_KEY=...
RTPR_API_KEY=...
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
PORT=3001

# Frontend
VITE_WS_URL=ws://localhost:3001
VITE_API_URL=http://localhost:3001/api
VITE_TRADINGVIEW_LIBRARY_PATH=/charting_library/  # if using full library
```

---

## 13. Required External Accounts & Credentials

| Service | Purpose | Cost Estimate |
|---------|---------|--------------|
| **RTPR.io** | Real-time news wire WebSocket | See rtpr.io/dashboard |
| **Polygon.io** | Real-time market data for scanners | Stocks Starter ~$29/mo; Stocks Developer ~$79/mo for WS |
| **TradingView Premium** | Chart embeds — user already has | Already owned |
| PostgreSQL | Persistence | Free (self-hosted) |
| Redis | Cache | Free (self-hosted) |

> **Note on TradingView integration:** The free **Advanced Charts widget** (public JS embed) works without any agreement and supports most features. The full **Charting Library** requires a TradingView partner agreement but enables deeper customization. For v1, the Advanced Charts widget is recommended.

---

## 14. Open Questions

1. **Authentication** — Single-user (local only) or multi-user with login?
2. **Polygon.io tier** — Do you have an existing Polygon.io subscription, or should we architect around a free-tier fallback (e.g., yfinance for non-real-time data)?
3. **TradingView integration depth** — Advanced Charts widget (simpler, no agreement needed) vs. full Charting Library (requires TradingView partner agreement)?
4. **Hosting** — Local machine only, or deploy to a VPS/cloud?
5. **Scanner data freshness** — Should scanners run 24/7 (pre-market starts 4 AM ET) or only during market hours?
