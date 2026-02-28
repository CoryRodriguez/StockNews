/**
 * Benzinga REST API polling service (regular tier)
 *
 * Polls https://api.benzinga.com/api/v2/news every 15 seconds,
 * de-duplicates by article ID, and fans articles out to dashboard
 * clients via the same clientHub broadcast used by RTPR.
 */
import { config } from "../config";
import { broadcast } from "../ws/clientHub";
import { pushArticle, RtprArticle, markNewsTicker } from "./rtpr";
import { getActiveScannersForTicker } from "./scanner";
import { executePaperTrade } from "./paperTrader";
import { evaluateBotSignal } from "./signalEngine";

const POLL_INTERVAL_MS = 15_000;
const BASE_URL = "https://api.benzinga.com/api/v2/news";

// Track IDs we've already processed to avoid re-broadcasting on overlap
const seenIds = new Set<string>();

interface BenzingaStock {
  name: string; // ticker symbol, e.g. "AAPL"
}

interface BenzingaArticle {
  id: string;
  author: string;
  created: string; // RFC 2822, e.g. "Thu, 24 Feb 2025 10:00:00 -0500"
  updated: string;
  title: string;
  teaser: string;
  body: string;
  url: string;
  stocks: BenzingaStock[];
}

// Unix timestamp (seconds) — how far back to fetch on the first poll (6 hours)
let lastUpdatedSince = Math.floor((Date.now() - 6 * 60 * 60 * 1000) / 1000);

export function startBenzinga() {
  if (!config.benzingaApiKey) {
    console.warn("[Benzinga] No API key set — news feed disabled");
    return;
  }
  console.log("[Benzinga] Starting — polling every 15s");
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

async function poll() {
  const params = new URLSearchParams({
    token: config.benzingaApiKey,
    pageSize: "50",
    displayOutput: "full",
    updatedSince: String(lastUpdatedSince),
    sort: "created:desc",
  });

  try {
    const resp = await fetch(`${BASE_URL}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      console.error(`[Benzinga] HTTP ${resp.status} ${resp.statusText}`);
      return;
    }

    const articles = (await resp.json()) as BenzingaArticle[];
    if (!Array.isArray(articles) || articles.length === 0) {
      console.log("[Benzinga] Poll: 0 new articles");
      return;
    }
    console.log(`[Benzinga] Poll: ${articles.length} article(s)`);

    // Advance the cursor so next poll only fetches new articles
    lastUpdatedSince = Math.floor(Date.now() / 1000);

    for (const bz of articles) {
      if (!bz.id || seenIds.has(bz.id)) continue;
      seenIds.add(bz.id);

      const tickers = (bz.stocks ?? []).map((s) => s.name).filter(Boolean);
      if (tickers.length === 0) continue; // skip non-equity / macro items

      const createdAt = bz.created
        ? new Date(bz.created).toISOString()
        : new Date().toISOString();
      const receivedAt = new Date().toISOString();

      for (const ticker of tickers) {
        const article: RtprArticle = {
          ticker,
          title: bz.title,
          body: bz.body || bz.teaser || "",
          author: bz.author || "Benzinga",
          source: "benzinga",
          createdAt,
          receivedAt,
        };

        // Persist + push to in-memory ring buffer
        pushArticle(article);

        // Mark ticker as having recent news (drives scanner news dots)
        markNewsTicker(ticker);

        // Fan out to all connected WebSocket clients
        broadcast("news", { type: "news_article", article });
        broadcast("scanner:news_flow", {
          type: "scanner_alert",
          scannerId: "news_flow",
          ticker,
          title: bz.title,
          receivedAt,
        });

        // Trigger paper trade if this ticker has active scanner alerts
        const activeScanners = getActiveScannersForTicker(ticker);
        if (activeScanners.length > 0) {
          executePaperTrade(article, activeScanners).catch((err) =>
            console.error("[Benzinga] PaperTrader error:", err)
          );
        }

        // Signal engine evaluation — unconditional, fire-and-forget
        evaluateBotSignal(article).catch((err) =>
          console.error("[Benzinga] SignalEngine error:", err instanceof Error ? err.message : err)
        );
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Benzinga] Poll error:", msg);
  }
}
