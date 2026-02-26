/**
 * Alpaca News WebSocket service
 *
 * Connects to wss://stream.data.alpaca.markets/v1beta1/news, subscribes to
 * all tickers ("*"), and fans articles out to dashboard clients via the same
 * clientHub broadcast used by RTPR and Benzinga.
 */
import WebSocket from "ws";
import { config } from "../config";
import { broadcast } from "../ws/clientHub";
import { recentArticles, RtprArticle, markNewsTicker } from "./rtpr";
import { getActiveScannersForTicker } from "./scanner";
import { executePaperTrade } from "./paperTrader";

const WS_URL = "wss://stream.data.alpaca.markets/v1beta1/news";
const MAX_RECENT = 200;
const seenIds = new Set<string>();

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function startAlpacaNews() {
  if (!config.alpacaApiKey) {
    console.warn("[AlpacaNews] No API key — news feed disabled");
    return;
  }
  console.log("[AlpacaNews] Connecting...");
  connect();
}

function connect() {
  ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    ws!.send(
      JSON.stringify({
        action: "auth",
        key: config.alpacaApiKey,
        secret: config.alpacaApiSecret,
      })
    );
  });

  ws.on("message", (data) => {
    try {
      const msgs = JSON.parse(data.toString()) as AlpacaNewsMessage[];
      for (const msg of msgs) handleMessage(msg);
    } catch {
      // ignore parse errors
    }
  });

  ws.on("close", () => {
    console.warn("[AlpacaNews] Disconnected — reconnecting in 5s");
    scheduleReconnect(5000);
  });

  ws.on("error", (err) => console.error("[AlpacaNews] Error:", err.message));
}

interface AlpacaNewsMessage {
  T: string;          // "success" | "subscription" | "n" (news)
  msg?: string;       // "authenticated" on success
  // News article fields (T === "n")
  id?: number;
  headline?: string;
  summary?: string;
  author?: string;
  created_at?: string; // ISO 8601
  symbols?: string[];
}

function handleMessage(msg: AlpacaNewsMessage) {
  if (msg.T === "success" && msg.msg === "authenticated") {
    console.log("[AlpacaNews] Authenticated — subscribing to all news");
    ws!.send(JSON.stringify({ action: "subscribe", news: ["*"] }));
    return;
  }

  if (msg.T === "subscription") {
    console.log("[AlpacaNews] Subscribed");
    return;
  }

  if (msg.T === "n" && msg.id && msg.headline) {
    const idStr = String(msg.id);
    if (seenIds.has(idStr)) return;
    seenIds.add(idStr);

    const tickers = msg.symbols ?? [];
    if (tickers.length === 0) return; // skip macro / non-equity news

    const createdAt = msg.created_at ?? new Date().toISOString();
    const receivedAt = new Date().toISOString();

    for (const ticker of tickers) {
      const article: RtprArticle = {
        ticker,
        title: msg.headline,
        body: msg.summary ?? "",
        author: msg.author ?? "Alpaca",
        source: "alpaca",
        createdAt,
        receivedAt,
      };

      // Push to shared in-memory ring buffer
      recentArticles.unshift(article);
      if (recentArticles.length > MAX_RECENT) recentArticles.pop();

      // Mark ticker as having recent news (drives scanner news dots)
      markNewsTicker(ticker);

      // Fan out to all connected WebSocket clients
      broadcast("news", { type: "news_article", article });
      broadcast("scanner:news_flow", {
        type: "scanner_alert",
        scannerId: "news_flow",
        ticker,
        title: msg.headline,
        receivedAt,
      });

      // Trigger paper trade if this ticker has active scanner alerts
      const activeScanners = getActiveScannersForTicker(ticker);
      if (activeScanners.length > 0) {
        executePaperTrade(article, activeScanners).catch((err) =>
          console.error("[AlpacaNews] PaperTrader error:", err)
        );
      }
    }
  }
}

function scheduleReconnect(delayMs: number) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => connect(), delayMs);
}
