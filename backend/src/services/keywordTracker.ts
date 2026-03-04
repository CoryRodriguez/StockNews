/**
 * Keyword Tracker Service
 *
 * Logs every AI-analyzed article as a KeywordHit row with keyword/category
 * and enriches price performance at 1h/4h/EOD intervals.
 */
import prisma from "../db/client";
import { getSnapshots } from "./alpaca";
import { broadcast } from "../ws/clientHub";

// ── Types ────────────────────────────────────────────────────────────────

export interface KeywordHitParams {
  articleId: number;
  ticker: string;
  headline: string;
  source: string;
  matchedKeyword: string | null;
  catalystCategory: string | null;
  catalystTier: number | null;
  aiStars: number;
  aiAnalysis: string;
  aiConfidence: string;
}

// ── Log a new keyword hit ────────────────────────────────────────────────

export async function logKeywordHit(params: KeywordHitParams): Promise<void> {
  try {
    // Fetch current price
    let priceAtNews: number | null = null;
    try {
      const snaps = await getSnapshots([params.ticker]);
      if (snaps.length > 0) priceAtNews = snaps[0].price;
    } catch { /* price fetch is best-effort */ }

    const hit = await prisma.keywordHit.create({
      data: {
        articleId: params.articleId,
        ticker: params.ticker,
        headline: params.headline,
        source: params.source,
        matchedKeyword: params.matchedKeyword,
        catalystCategory: params.catalystCategory,
        catalystTier: params.catalystTier,
        aiStars: params.aiStars,
        aiAnalysis: params.aiAnalysis,
        aiConfidence: params.aiConfidence,
        priceAtNews,
      },
    });

    // Broadcast to frontend
    broadcast("catalyst", {
      type: "catalyst_keyword_hit",
      hit: {
        id: hit.id,
        ticker: hit.ticker,
        headline: hit.headline,
        source: hit.source,
        matchedKeyword: hit.matchedKeyword,
        catalystCategory: hit.catalystCategory,
        catalystTier: hit.catalystTier,
        aiStars: hit.aiStars,
        aiAnalysis: hit.aiAnalysis,
        aiConfidence: hit.aiConfidence,
        priceAtNews: hit.priceAtNews,
        createdAt: hit.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("[KeywordTracker] Failed to log hit:", err instanceof Error ? err.message : err);
  }
}

// ── Price enrichment loop ────────────────────────────────────────────────

const ENRICHMENT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function getNowET(): Date {
  // Create a Date representing "now" and use it for ET-based comparisons
  return new Date();
}

function getETHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
    10
  );
}

async function enrichPrices(): Promise<void> {
  const now = getNowET();

  // 1h enrichment: created > 1h ago, price1h still null, has priceAtNews
  const need1h = await prisma.keywordHit.findMany({
    where: {
      price1h: null,
      priceAtNews: { not: null },
      createdAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) },
    },
    take: 50,
  });

  // 4h enrichment
  const need4h = await prisma.keywordHit.findMany({
    where: {
      price4h: null,
      priceAtNews: { not: null },
      createdAt: { lt: new Date(now.getTime() - 4 * 60 * 60 * 1000) },
    },
    take: 50,
  });

  // EOD enrichment: after 4 PM ET
  const etHour = getETHour();
  const needEod = etHour >= 16
    ? await prisma.keywordHit.findMany({
        where: {
          priceEod: null,
          priceAtNews: { not: null },
          createdAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            lt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
          },
        },
        take: 50,
      })
    : [];

  // Collect unique tickers
  const allHits = [...need1h, ...need4h, ...needEod];
  const tickers = [...new Set(allHits.map((h) => h.ticker))];
  if (tickers.length === 0) return;

  // Fetch current prices
  const snaps = await getSnapshots(tickers);
  const priceMap = new Map(snaps.map((s) => [s.ticker, s.price]));

  // Update rows
  for (const hit of need1h) {
    const price = priceMap.get(hit.ticker);
    if (price == null || hit.priceAtNews == null) continue;
    const returnPct = ((price - hit.priceAtNews) / hit.priceAtNews) * 100;
    await prisma.keywordHit.update({
      where: { id: hit.id },
      data: { price1h: price, return1hPct: Math.round(returnPct * 100) / 100 },
    });
  }

  for (const hit of need4h) {
    const price = priceMap.get(hit.ticker);
    if (price == null || hit.priceAtNews == null) continue;
    const returnPct = ((price - hit.priceAtNews) / hit.priceAtNews) * 100;
    await prisma.keywordHit.update({
      where: { id: hit.id },
      data: { price4h: price, return4hPct: Math.round(returnPct * 100) / 100 },
    });
  }

  for (const hit of needEod) {
    const price = priceMap.get(hit.ticker);
    if (price == null || hit.priceAtNews == null) continue;
    const returnPct = ((price - hit.priceAtNews) / hit.priceAtNews) * 100;
    await prisma.keywordHit.update({
      where: { id: hit.id },
      data: { priceEod: price, returnEodPct: Math.round(returnPct * 100) / 100 },
    });
  }

  if (allHits.length > 0) {
    console.log(`[KeywordTracker] Enriched prices: ${need1h.length} 1h, ${need4h.length} 4h, ${needEod.length} EOD`);
  }
}

export function startKeywordPriceEnrichment(): void {
  console.log("[KeywordTracker] Price enrichment started (every 5 min)");
  setInterval(() => {
    enrichPrices().catch((err) =>
      console.error("[KeywordTracker] Enrichment error:", err instanceof Error ? err.message : err)
    );
  }, ENRICHMENT_INTERVAL_MS);
}
