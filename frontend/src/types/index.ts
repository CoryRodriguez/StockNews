// ── Scanner ────────────────────────────────────────────────────────────────

export interface ScannerAlert {
  scannerId: string;
  ticker: string;
  price: number;
  changePct: number;
  gapPct: number;
  volume: number;
  relativeVolume: number;
  float?: number;
  high: number;
  low: number;
  hasNews: boolean;
  alertedAt: string;
}

export interface ScannerDefinition {
  id: string;
  name: string;
}

// ── News ───────────────────────────────────────────────────────────────────

export interface NewsArticle {
  ticker: string;
  title: string;
  body: string;
  author: string;
  source?: string;   // "rtpr" | "benzinga" | etc.
  createdAt: string;
  receivedAt: string;
  stars?: number; // 1-5, derived from catalyst keywords
}

// ── Watchlist ──────────────────────────────────────────────────────────────

export interface WatchlistItem {
  ticker: string;
  price: number;
  prevClose: number;
  changePct: number;
  changeDollar: number;
  volume: number;
  high: number;
  low: number;
  relativeVolume?: number;
  float?: number;
}

export interface Watchlist {
  id: string;
  name: string;
  tickers: string[];
}

// ── Paper Trading ──────────────────────────────────────────────────────────

export interface PaperTrade {
  id: string;
  ticker: string;
  qty: number;
  buyOrderId: string | null;
  buyPrice: number | null;
  buyStatus: "pending" | "filled" | "error";
  sellOrderId: string | null;
  sellPrice: number | null;
  sellStatus: "awaiting" | "pending" | "filled" | "error";
  catalyst: string;
  // tier1=M&A, tier2=FDA/Clinical, tier3=Earnings, tier4=Contract, other=unclassified
  catalystType: "tier1" | "tier2" | "tier3" | "tier4" | "other";
  scannerId: string | null;
  pnl: number | null;
  createdAt: string;
  updatedAt: string;
}

// ── Layout ─────────────────────────────────────────────────────────────────

export type PanelType = "scanner" | "chart" | "news" | "watchlist" | "trades" | "analytics" | "bot";

export interface PanelConfig {
  id: string;
  type: PanelType;
  title?: string;
  // type-specific config
  scannerId?: string;
  symbol?: string;         // for chart panels
  newsMode?: "firehose" | "linked";
  watchlistId?: string;
}

export interface GridPanel extends PanelConfig {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SavedLayout {
  id: string;
  name: string;
  panels: GridPanel[];
}

// ── WebSocket messages ────────────────────────────────────────────────────

export type WsMessage =
  | { type: "connected" }
  | { type: "news_article"; article: NewsArticle; channel: string }
  | { type: "scanner_alert"; channel: string; scannerId: string } & ScannerAlert
  | { type: "scanner_clear"; channel: string; scannerId: string; ticker: string }
  | { type: "quote_update"; channel: string; ticker: string; price: number; volume?: number }
  | { type: "trade_update"; channel: string; trade: PaperTrade }
  | { type: "bot_status_update"; channel: string; status: { state: string; mode: string; openPositionCount: number; todayRealizedPnl: number; todayTradeCount: number; dayTradeCount: number; marketOpen: boolean } }
  | { type: "bot_trade_closed"; channel: string; trade: { id: string; symbol: string; entryPrice: number | null; exitPrice: number | null; shares: number | null; pnl: number | null; catalystType: string | null; exitReason: string | null; entryAt: string | null; exitAt: string | null } }
  | { type: "bot_signal_evaluated"; channel: string; signal: { id: string; symbol: string; catalystCategory: string | null; catalystTier: number | null; rejectReason: string | null; evaluatedAt: string } };
