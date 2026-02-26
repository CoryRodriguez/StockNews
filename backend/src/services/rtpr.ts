/**
 * RTPR.io WebSocket service
 * Connects to wss://ws.rtpr.io, subscribes to all tickers (firehose),
 * and fans articles out to dashboard clients via the clientHub.
 */
import WebSocket from "ws";
import { config } from "../config";
import { broadcast } from "../ws/clientHub";
import { getActiveScannersForTicker } from "./scanner";
import { executePaperTrade } from "./paperTrader";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// In-memory store of recent articles for the REST fallback endpoint
export const recentArticles: RtprArticle[] = [];
const MAX_RECENT = 200;

export interface RtprArticle {
  ticker: string;
  title: string;
  body: string;
  author: string;
  source: string;    // "rtpr" | "benzinga" | etc.
  createdAt: string; // ISO string from RTPR
  receivedAt: string; // when we got it
}

// Track tickers that received news in last 60 min (for scanner news dots)
const recentNewsTickers = new Map<string, number>(); // ticker → timestamp ms

export function hasRecentNews(ticker: string): boolean {
  const ts = recentNewsTickers.get(ticker);
  if (!ts) return false;
  return Date.now() - ts < 60 * 60 * 1000;
}

export function markNewsTicker(ticker: string): void {
  recentNewsTickers.set(ticker, Date.now());
}

export function startRtpr() {
  if (!config.rtprApiKey) {
    console.warn("[RTPR] No API key set — news feed disabled");
    return;
  }
  connect();
}

function connect() {
  console.log("[RTPR] Connecting...");
  ws = new WebSocket(`${config.rtprWsUrl}?apiKey=${config.rtprApiKey}`);

  ws.on("open", () => {
    console.log("[RTPR] Connected");
    ws!.send(JSON.stringify({ action: "subscribe", tickers: ["*"] }));
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as RtprMessage;
      handleMessage(msg);
    } catch {
      // ignore parse errors
    }
  });

  ws.on("close", () => {
    console.warn("[RTPR] Disconnected — reconnecting in 5s");
    scheduleReconnect(5000);
  });

  ws.on("error", (err) => {
    console.error("[RTPR] Error:", err.message);
  });
}

interface RtprMessage {
  type: "connected" | "subscribed" | "article" | "ping" | "error";
  ticker?: string;
  title?: string;
  body?: string;
  author?: string;
  created?: string;
  message?: string;
}

function handleMessage(msg: RtprMessage) {
  if (msg.type === "ping") {
    ws?.send(JSON.stringify({ type: "pong" }));
    return;
  }

  if (msg.type === "article" && msg.ticker && msg.title) {
    const article: RtprArticle = {
      ticker: msg.ticker,
      title: msg.title,
      body: msg.body ?? "",
      author: msg.author ?? "",
      source: "rtpr",
      createdAt: msg.created ?? new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    };

    // Store in memory ring buffer
    recentArticles.unshift(article);
    if (recentArticles.length > MAX_RECENT) recentArticles.pop();

    // Update news dot tracker
    recentNewsTickers.set(article.ticker, Date.now());

    // Fan out to subscribed clients
    broadcast("news", { type: "news_article", article });

    // Also emit as a News Flow scanner alert
    broadcast("scanner:news_flow", {
      type: "scanner_alert",
      scannerId: "news_flow",
      ticker: article.ticker,
      title: article.title,
      receivedAt: article.receivedAt,
    });

    // Paper trade: buy if this ticker is currently on any scanner alert
    const activeScanners = getActiveScannersForTicker(article.ticker);
    if (activeScanners.length > 0) {
      executePaperTrade(article, activeScanners).catch((err) =>
        console.error("[PaperTrader] Uncaught error:", err)
      );
    }
  }
}

function scheduleReconnect(delayMs: number) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => connect(), delayMs);
}
