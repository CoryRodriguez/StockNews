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
  const data = await fetchJson<AlpacaSnapshotResponse>(
    `/v2/stocks/snapshots?symbols=${encodeURIComponent(param)}&feed=iex`
  );
  if (!data) return [];

  return Object.entries(data).map(([symbol, snap]) => {
    const price = snap.latestTrade?.p ?? snap.dailyBar?.c ?? 0;
    const prevClose = snap.prevDailyBar?.c ?? 0;
    const open = snap.dailyBar?.o ?? 0;
    const volume = snap.dailyBar?.v ?? 0;
    const avgVol = snap.prevDailyBar?.v ?? 1; // rough proxy; 30d avg needs separate call
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
