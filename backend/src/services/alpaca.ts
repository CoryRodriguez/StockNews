/**
 * Alpaca Markets service
 * - REST: bulk snapshots for scanner polling & watchlist prices
 * - WebSocket: real-time quote streaming for active watchlist tickers
 */
import WebSocket from "ws";
import { config } from "../config";
import { broadcast } from "../ws/clientHub";
import { hasRecentNews } from "./rtpr";

const BASE_URL = config.alpacaDataUrl;
const authHeaders = {
  "APCA-API-Key-ID": config.alpacaApiKey,
  "APCA-API-Secret-Key": config.alpacaApiSecret,
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface Snapshot {
  ticker: string;
  price: number;
  prevClose: number;
  open: number;
  changePct: number;
  gapPct: number;
  volume: number;
  avgVolume30d: number;
  relativeVolume: number;
  high: number;
  low: number;
  hasNews: boolean;
}

interface AlpacaSnapshotResponse {
  [symbol: string]: {
    latestTrade?: { p: number };
    dailyBar?: { o: number; h: number; l: number; v: number; c: number };
    prevDailyBar?: { c: number; v: number };
  };
}

interface AlpacaBarsResponse {
  bars: Record<string, Array<{ v: number }>>;
  next_page_token?: string | null;
}

interface AlpacaHourlyBarsResponse {
  bars: Record<string, Array<{ o: number; c: number }>>;
  next_page_token?: string | null;
}

// ── 30-day average volume cache (refreshed hourly) ───────────────────────────

const avgVolCache: { data: Record<string, number>; ts: number; symbols: string } = {
  data: {},
  ts: 0,
  symbols: "",
};
const AVG_VOL_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function get30dAvgVolumes(symbols: string[]): Promise<Record<string, number>> {
  const now = Date.now();
  const symbolKey = [...symbols].sort().join(",");
  if (
    now - avgVolCache.ts < AVG_VOL_CACHE_TTL &&
    avgVolCache.symbols === symbolKey &&
    Object.keys(avgVolCache.data).length > 0
  ) {
    return avgVolCache.data;
  }

  // ~45 calendar days covers 30 trading days accounting for weekends/holidays
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 45);
  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  const data = await fetchJson<AlpacaBarsResponse>(
    `/v2/stocks/bars?symbols=${encodeURIComponent(symbols.join(","))}&timeframe=1Day&start=${startStr}&end=${endStr}&limit=10000&feed=iex`
  );

  const result: Record<string, number> = {};
  if (data?.bars) {
    for (const [sym, bars] of Object.entries(data.bars)) {
      if (bars.length > 0) {
        // Use up to last 30 bars
        const slice = bars.slice(-30);
        result[sym] = slice.reduce((sum, b) => sum + b.v, 0) / slice.length;
      }
    }
  }

  avgVolCache.data = result;
  avgVolCache.ts = now;
  avgVolCache.symbols = symbolKey;
  return result;
}

// ── REST helpers ────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T | null> {
  if (!config.alpacaApiKey) return null;
  try {
    const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders });
    if (!res.ok) {
      console.error(`[Alpaca] ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error("[Alpaca] fetch error:", err);
    return null;
  }
}

/** Fetch snapshots for up to 1000 symbols at once */
export async function getSnapshots(symbols: string[]): Promise<Snapshot[]> {
  if (!symbols.length) return [];
  const param = symbols.join(",");

  const [data, avgVolumes] = await Promise.all([
    fetchJson<AlpacaSnapshotResponse>(
      `/v2/stocks/snapshots?symbols=${encodeURIComponent(param)}&feed=iex`
    ),
    get30dAvgVolumes(symbols),
  ]);
  if (!data) return [];

  return Object.entries(data).map(([symbol, snap]) => {
    const price = snap.latestTrade?.p ?? snap.dailyBar?.c ?? 0;
    const prevClose = snap.prevDailyBar?.c ?? 0;
    const open = snap.dailyBar?.o ?? 0;
    const volume = snap.dailyBar?.v ?? 0;
    // Prefer true 30-day average; fall back to previous day if bars unavailable
    const avgVol = avgVolumes[symbol] ?? snap.prevDailyBar?.v ?? 1;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    const gapPct = prevClose > 0 ? ((open - prevClose) / prevClose) * 100 : 0;
    const relativeVolume = avgVol > 0 ? volume / avgVol : 0;

    return {
      ticker: symbol,
      price,
      prevClose,
      open,
      changePct,
      gapPct,
      volume,
      avgVolume30d: avgVol,
      relativeVolume,
      high: snap.dailyBar?.h ?? 0,
      low: snap.dailyBar?.l ?? 0,
      hasNews: hasRecentNews(symbol),
    };
  });
}

// ── 1-hour % change ──────────────────────────────────────────────────────────

const hourlyChangeCache = new Map<string, { pct: number; ts: number }>();
const HOURLY_CHANGE_TTL = 60_000; // 60 seconds

/** Returns % change from the open of the current 1-hour bar to latest price. */
export async function getHourlyChanges(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  const now = Date.now();

  const fresh: Record<string, number> = {};
  const stale: string[] = [];

  for (const sym of symbols) {
    const cached = hourlyChangeCache.get(sym);
    if (cached && now - cached.ts < HOURLY_CHANGE_TTL) {
      fresh[sym] = cached.pct;
    } else {
      stale.push(sym);
    }
  }

  if (stale.length === 0) return fresh;

  const data = await fetchJson<AlpacaHourlyBarsResponse>(
    `/v2/stocks/bars?symbols=${encodeURIComponent(stale.join(","))}&timeframe=1Hour&limit=2&feed=iex&adjustment=raw`
  );

  const needsSnapshot: string[] = [];
  for (const sym of stale) {
    const bars = data?.bars?.[sym];
    if (bars && bars.length > 0) {
      const bar = bars[bars.length - 1];
      const pct = bar.o > 0 ? ((bar.c - bar.o) / bar.o) * 100 : 0;
      fresh[sym] = pct;
      hourlyChangeCache.set(sym, { pct, ts: now });
    } else {
      needsSnapshot.push(sym);
    }
  }

  // Fallback: use daily changePct from snapshot when no 1h bars available (pre/post-market)
  if (needsSnapshot.length > 0) {
    const snapData = await fetchJson<AlpacaSnapshotResponse>(
      `/v2/stocks/snapshots?symbols=${encodeURIComponent(needsSnapshot.join(","))}&feed=iex`
    );
    for (const sym of needsSnapshot) {
      const snap = snapData?.[sym];
      const price = snap?.latestTrade?.p ?? snap?.dailyBar?.c ?? 0;
      const prevClose = snap?.prevDailyBar?.c ?? 0;
      const pct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
      fresh[sym] = pct;
      hourlyChangeCache.set(sym, { pct, ts: now });
    }
  }

  return fresh;
}

// ── Intraday VWAP ────────────────────────────────────────────────────────────

interface MinuteBar {
  h: number;
  l: number;
  c: number;
  v: number;
}

interface SingleSymbolBarsResponse {
  bars: MinuteBar[];
  symbol: string;
  next_page_token?: string | null;
}

// Per-ticker cache: stores the computed session VWAP (not the deviation,
// so multiple callers can use the same fetch even if their current prices differ)
const vwapCache = new Map<string, { vwap: number; cachedAt: number }>();
const VWAP_CACHE_TTL = 60_000; // 60 seconds — VWAP changes ~every minute

async function computeSessionVwap(symbol: string): Promise<number | null> {
  // Use 4:00 AM ET as session start (≈ 09:00 UTC in winter / 08:00 UTC in summer).
  // We use a fixed -5h offset (EST) as a practical approximation — close enough for
  // VWAP purposes and avoids a DST library dependency.
  const nowET = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const dateStr = nowET.toISOString().slice(0, 10); // YYYY-MM-DD in ET
  const start = `${dateStr}T09:00:00Z`; // 4 AM ET ≈ 09:00 UTC

  const data = await fetchJson<SingleSymbolBarsResponse>(
    `/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=1Min&start=${encodeURIComponent(start)}&limit=1000&feed=iex`
  );

  if (!data?.bars?.length) return null;

  let totalTPV = 0; // sum of (typical_price × volume)
  let totalVol = 0;

  for (const bar of data.bars) {
    const tp = (bar.h + bar.l + bar.c) / 3; // typical price
    totalTPV += tp * bar.v;
    totalVol += bar.v;
  }

  return totalVol > 0 ? totalTPV / totalVol : null;
}

/**
 * Returns the VWAP deviation for a symbol at the given current price.
 *   deviation % = (currentPrice - vwap) / vwap × 100
 * Positive = price is extended above VWAP (reversion risk).
 * Negative = price is below VWAP (support zone).
 * Returns null if Alpaca data is unavailable.
 */
export async function getVwapDev(
  symbol: string,
  currentPrice: number
): Promise<number | null> {
  const now = Date.now();
  const cached = vwapCache.get(symbol);

  let vwap: number | null = null;

  if (cached && now - cached.cachedAt < VWAP_CACHE_TTL) {
    vwap = cached.vwap;
  } else {
    vwap = await computeSessionVwap(symbol);
    if (vwap != null) {
      vwapCache.set(symbol, { vwap, cachedAt: now });
    }
  }

  if (vwap == null || vwap === 0) return null;
  return ((currentPrice - vwap) / vwap) * 100;
}

/** Fetch the most active stocks right now (top 100 by volume) */
export async function getMostActives(): Promise<string[]> {
  const data = await fetchJson<{ most_actives: Array<{ symbol: string }> }>(
    "/v1beta1/screener/stocks/most-actives?by=volume&top=100"
  );
  return data?.most_actives.map((s) => s.symbol) ?? [];
}

// ── WebSocket for real-time watchlist quotes ────────────────────────────────

let alpacaWs: WebSocket | null = null;
let subscribedTickers = new Set<string>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function startAlpacaWs() {
  if (!config.alpacaApiKey) {
    console.warn("[Alpaca WS] No API key — real-time quotes disabled");
    return;
  }
  connectWs();
}

function connectWs() {
  alpacaWs = new WebSocket(config.alpacaWsUrl);

  alpacaWs.on("open", () => {
    alpacaWs!.send(
      JSON.stringify({
        action: "auth",
        key: config.alpacaApiKey,
        secret: config.alpacaApiSecret,
      })
    );
  });

  alpacaWs.on("message", (data) => {
    try {
      const msgs = JSON.parse(data.toString()) as AlpacaWsMessage[];
      for (const msg of msgs) handleWsMessage(msg);
    } catch {
      // ignore
    }
  });

  alpacaWs.on("close", () => {
    console.warn("[Alpaca WS] Disconnected — reconnecting in 5s");
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWs, 5000);
  });

  alpacaWs.on("error", (err) => console.error("[Alpaca WS] Error:", err.message));
}

interface AlpacaWsMessage {
  T: string; // message type
  S?: string; // symbol
  p?: number; // price (trade)
  ap?: number; // ask price
  bp?: number; // bid price
  v?: number; // volume
}

function handleWsMessage(msg: AlpacaWsMessage) {
  if (msg.T === "success" && (msg as unknown as { msg: string }).msg === "authenticated") {
    console.log("[Alpaca WS] Authenticated");
    resubscribeAll();
    return;
  }

  // Real-time trade update → broadcast quote to clients
  if (msg.T === "t" && msg.S && msg.p) {
    broadcast(`quotes:${msg.S}`, {
      type: "quote_update",
      ticker: msg.S,
      price: msg.p,
      volume: msg.v,
    });
  }
}

export function subscribeQuotes(tickers: string[]) {
  const newOnes = tickers.filter((t) => !subscribedTickers.has(t));
  if (!newOnes.length) return;
  newOnes.forEach((t) => subscribedTickers.add(t));
  if (alpacaWs?.readyState === WebSocket.OPEN) {
    alpacaWs.send(JSON.stringify({ action: "subscribe", trades: newOnes }));
  }
}

export function unsubscribeQuotes(tickers: string[]) {
  tickers.forEach((t) => subscribedTickers.delete(t));
  if (alpacaWs?.readyState === WebSocket.OPEN) {
    alpacaWs.send(JSON.stringify({ action: "unsubscribe", trades: tickers }));
  }
}

function resubscribeAll() {
  if (subscribedTickers.size > 0 && alpacaWs?.readyState === WebSocket.OPEN) {
    alpacaWs.send(
      JSON.stringify({ action: "subscribe", trades: [...subscribedTickers] })
    );
  }
}
