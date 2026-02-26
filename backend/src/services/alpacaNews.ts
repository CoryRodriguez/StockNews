/**
 * Alpaca News API polling service
 *
 * Polls https://data.alpaca.markets/v1beta1/news every 30 seconds,
 * de-duplicates by article ID, and fans articles out to dashboard
 * clients via the same clientHub broadcast used by RTPR/Benzinga.
 */
import { config } from "../config";
import { broadcast } from "../ws/clientHub";
import { recentArticles, RtprArticle, markNewsTicker } from "./rtpr";
import { getActiveScannersForTicker } from "./scanner";
import { executePaperTrade } from "./paperTrader";

const POLL_INTERVAL_MS = 30_000;
const BASE_URL = "https://data.alpaca.markets/v1beta1/news";
const MAX_RECENT = 200;

const seenIds = new Set<string>();

interface AlpacaNewsArticle {
  id: number;
  headline: string;
  summary: string;
  author: string;
  created_at: string;
  updated_at: string;
  url: string;
  symbols: string[];
  source: string;
}

interface AlpacaNewsResponse {
  news: AlpacaNewsArticle[];
  next_page_token?: string;
}

export function startAlpacaNews() {
  if (!config.alpacaApiKey) {
    console.warn("[Alpaca News] No API key set — news feed disabled");
    return;
  }
  console.log("[Alpaca News] Starting — polling every 30s");
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

async function poll() {
  try {
    const params = new URLSearchParams({
      limit: "50",
      sort: "desc",
    });

    const resp = await fetch(`${BASE_URL}?${params}`, {
      headers: {
        "APCA-API-Key-ID": config.alpacaApiKey,
        "APCA-API-Secret-Key": config.alpacaApiSecret,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      console.error(`[Alpaca News] HTTP ${resp.status} ${resp.statusText}`);
      return;
    }

    const data = (await resp.json()) as AlpacaNewsResponse;
    if (!data.news?.length) return;

    for (const item of data.news) {
      const idStr = String(item.id);
      if (seenIds.has(idStr)) continue;
      seenIds.add(idStr);

      const tickers = (item.symbols ?? []).filter(Boolean);
      if (tickers.length === 0) continue;

      const createdAt = item.created_at
        ? new Date(item.created_at).toISOString()
        : new Date().toISOString();
      const receivedAt = new Date().toISOString();

      for (const ticker of tickers) {
        const article: RtprArticle = {
          ticker,
          title: item.headline,
          body: item.summary || "",
          author: item.author || item.source || "Alpaca",
          createdAt,
          receivedAt,
          source: "alpaca",
        };

        recentArticles.unshift(article);
        if (recentArticles.length > MAX_RECENT) recentArticles.pop();

        markNewsTicker(ticker);

        broadcast("news", { type: "news_article", article });
        broadcast("scanner:news_flow", {
          type: "scanner_alert",
          scannerId: "news_flow",
          ticker,
          title: item.headline,
          receivedAt,
        });

        const activeScanners = getActiveScannersForTicker(ticker);
        if (activeScanners.length > 0) {
          executePaperTrade(article, activeScanners).catch((err) =>
            console.error("[Alpaca News] PaperTrader error:", err)
          );
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Alpaca News] Poll error:", msg);
  }
}
