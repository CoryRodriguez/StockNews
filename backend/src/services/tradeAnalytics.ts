/**
 * Trade Analytics Collector
 *
 * Creates enriched TradeAnalytics records when paper trades are executed.
 * Gathers snapshot context (volume, relative volume) and classifies the
 * catalyst at a granular level for the strategy engine.
 */
import prisma from "../db/client";
import { getSnapshots } from "./alpaca";
import {
  classifyCatalystGranular,
  isPreMarket,
  type CatalystCategory,
} from "./catalystClassifier";
import { startPriceTracking, stopPriceTracking } from "./priceTracker";
import type { RtprArticle } from "./rtpr";

export interface TradeContext {
  paperTradeId: string;
  article: RtprArticle;
  entryPrice: number;
  entryTimestamp: Date;
}

/**
 * Called after a buy fills. Creates the TradeAnalytics record and starts
 * the price snapshot tracker.
 */
export async function recordTradeAnalytics(ctx: TradeContext): Promise<string | null> {
  try {
    // Classify the catalyst at a granular level
    const classification = classifyCatalystGranular(ctx.article.title, ctx.article.body);
    if (!classification) return null; // shouldn't happen — danger patterns already filtered

    // Fetch current snapshot for volume/context data
    const snapshots = await getSnapshots([ctx.article.ticker]);
    const snap = snapshots[0];

    const entryVolume = snap?.volume ?? 0;
    const avgVolume30d = snap?.avgVolume30d ?? 0;
    const relativeVolume = snap?.relativeVolume ?? 0;

    const analytics = await prisma.tradeAnalytics.create({
      data: {
        paperTradeId: ctx.paperTradeId,
        newsHeadline: ctx.article.title,
        newsBody: ctx.article.body,
        newsSource: ctx.article.author || "rtpr",
        catalystCategory: classification.category,
        catalystTier: classification.tier,
        newsPublishedAt: new Date(ctx.article.createdAt),
        newsDetectedAt: new Date(ctx.article.receivedAt),
        tradeEnteredAt: ctx.entryTimestamp,
        entryPrice: ctx.entryPrice,
        entryVolume,
        avgVolume30d,
        relativeVolume,
        isPreMarket: isPreMarket(ctx.entryTimestamp),
      },
    });

    // Start capturing price snapshots at intervals
    startPriceTracking(analytics.id, ctx.article.ticker, ctx.entryPrice);

    console.log(
      `[TradeAnalytics] Recorded: ${ctx.article.ticker} | ${classification.category} (tier ${classification.tier}) | rVol=${relativeVolume.toFixed(1)}x`
    );

    return analytics.id;
  } catch (err) {
    console.error(
      "[TradeAnalytics] Error recording:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Called when a sell fills. Updates the analytics record with exit data.
 */
export async function recordTradeExit(
  paperTradeId: string,
  exitPrice: number,
  exitTimestamp: Date
): Promise<void> {
  try {
    const analytics = await prisma.tradeAnalytics.findUnique({
      where: { paperTradeId },
    });

    if (!analytics) return;

    const holdSec = Math.round(
      (exitTimestamp.getTime() - analytics.tradeEnteredAt.getTime()) / 1000
    );
    const returnPct =
      analytics.entryPrice > 0
        ? ((exitPrice - analytics.entryPrice) / analytics.entryPrice) * 100
        : 0;

    await prisma.tradeAnalytics.update({
      where: { id: analytics.id },
      data: {
        actualHoldSec: holdSec,
        exitPrice,
        returnPct,
      },
    });

    // Stop early snapshot tracking if still running (we have exit data now)
    stopPriceTracking(analytics.id);

    console.log(
      `[TradeAnalytics] Exit recorded: holdSec=${holdSec} return=${returnPct.toFixed(2)}%`
    );
  } catch (err) {
    console.error(
      "[TradeAnalytics] Error recording exit:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Get trade analytics summary for a specific catalyst category.
 */
export async function getCategoryStats(category?: CatalystCategory) {
  const where = category ? { catalystCategory: category } : {};

  const trades = await prisma.tradeAnalytics.findMany({
    where: { ...where, returnPct: { not: null } },
    include: { priceSnapshots: { orderBy: { offsetSeconds: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return trades;
}
