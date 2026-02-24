/**
 * Price Tracker Service
 *
 * After a trade is entered, captures price snapshots at scheduled intervals:
 * 15s, 30s, 1m, 2m, 5m, 10m, 15m, 30m, 1hr, 2hr.
 *
 * After all snapshots are collected, computes peak/trough/drawdown and
 * finalizes the TradeAnalytics record.
 */
import prisma from "../db/client";
import { getSnapshots, getVwapDev } from "./alpaca";

// Intervals in seconds to capture price snapshots
const SNAPSHOT_INTERVALS = [15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];

interface TrackedTrade {
  analyticsId: string;
  ticker: string;
  entryPrice: number;
  timers: ReturnType<typeof setTimeout>[];
}

// Active tracking jobs (keyed by analyticsId)
const activeTrackers = new Map<string, TrackedTrade>();

/**
 * Start tracking price snapshots for a trade.
 * Called right after the buy order fills.
 */
export function startPriceTracking(
  analyticsId: string,
  ticker: string,
  entryPrice: number
) {
  const timers: ReturnType<typeof setTimeout>[] = [];

  for (const offsetSec of SNAPSHOT_INTERVALS) {
    const timer = setTimeout(
      () => captureSnapshot(analyticsId, ticker, entryPrice, offsetSec),
      offsetSec * 1000
    );
    timers.push(timer);
  }

  activeTrackers.set(analyticsId, { analyticsId, ticker, entryPrice, timers });

  // After the last interval + a small buffer, finalize the analytics record
  const lastInterval = SNAPSHOT_INTERVALS[SNAPSHOT_INTERVALS.length - 1];
  const finalizeTimer = setTimeout(
    () => finalizeAnalytics(analyticsId),
    (lastInterval + 10) * 1000
  );
  timers.push(finalizeTimer);

  console.log(
    `[PriceTracker] Started tracking ${ticker} (${analyticsId}) — ${SNAPSHOT_INTERVALS.length} snapshots scheduled`
  );
}

/**
 * Stop tracking early (e.g., if the trade is sold before all snapshots).
 * Remaining unfired timers are cleared but already-captured snapshots stay.
 */
export function stopPriceTracking(analyticsId: string) {
  const tracked = activeTrackers.get(analyticsId);
  if (!tracked) return;
  tracked.timers.forEach((t) => clearTimeout(t));
  activeTrackers.delete(analyticsId);
  console.log(`[PriceTracker] Stopped tracking ${tracked.ticker} (${analyticsId})`);
}

async function captureSnapshot(
  analyticsId: string,
  ticker: string,
  entryPrice: number,
  offsetSec: number
) {
  try {
    const snapshots = await getSnapshots([ticker]);
    if (!snapshots.length) {
      console.warn(`[PriceTracker] No snapshot data for ${ticker} at ${offsetSec}s`);
      return;
    }

    const snap = snapshots[0];
    const returnPct =
      entryPrice > 0 ? ((snap.price - entryPrice) / entryPrice) * 100 : 0;

    // Compute VWAP deviation at this snapshot — cached, so minimal extra cost
    const vwapDev = await getVwapDev(ticker, snap.price);

    await prisma.priceSnapshot.upsert({
      where: {
        tradeAnalyticsId_offsetSeconds: {
          tradeAnalyticsId: analyticsId,
          offsetSeconds: offsetSec,
        },
      },
      create: {
        tradeAnalyticsId: analyticsId,
        offsetSeconds: offsetSec,
        price: snap.price,
        volume: snap.volume,
        returnPct,
        vwapDev: vwapDev ?? undefined,
      },
      update: {
        price: snap.price,
        volume: snap.volume,
        returnPct,
        vwapDev: vwapDev ?? undefined,
      },
    });
  } catch (err) {
    console.error(
      `[PriceTracker] Error capturing ${ticker} at ${offsetSec}s:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * After all snapshots are collected, compute peak, trough, and drawdown.
 */
async function finalizeAnalytics(analyticsId: string) {
  activeTrackers.delete(analyticsId);

  try {
    const analytics = await prisma.tradeAnalytics.findUnique({
      where: { id: analyticsId },
      include: { priceSnapshots: { orderBy: { offsetSeconds: "asc" } } },
    });

    if (!analytics || analytics.priceSnapshots.length === 0) return;

    const entryPrice = analytics.entryPrice;
    let peakPrice = entryPrice;
    let peakOffsetSec = 0;
    let troughAfterPeak = entryPrice;

    // Find peak price across all snapshots
    for (const snap of analytics.priceSnapshots) {
      if (snap.price > peakPrice) {
        peakPrice = snap.price;
        peakOffsetSec = snap.offsetSeconds;
      }
    }

    // Find trough after the peak
    for (const snap of analytics.priceSnapshots) {
      if (snap.offsetSeconds >= peakOffsetSec && snap.price < troughAfterPeak) {
        troughAfterPeak = snap.price;
      }
    }

    const maxDrawdownPct =
      peakPrice > 0 ? ((peakPrice - troughAfterPeak) / peakPrice) * 100 : 0;

    await prisma.tradeAnalytics.update({
      where: { id: analyticsId },
      data: {
        peakPrice,
        peakTimeOffsetSec: peakOffsetSec,
        troughAfterPeak,
        maxDrawdownPct,
      },
    });

    console.log(
      `[PriceTracker] Finalized ${analytics.paperTradeId}: peak=$${peakPrice.toFixed(2)} at ${peakOffsetSec}s, drawdown=${maxDrawdownPct.toFixed(1)}%`
    );
  } catch (err) {
    console.error(
      `[PriceTracker] Finalize error:`,
      err instanceof Error ? err.message : err
    );
  }
}

/** Get count of currently tracked trades (for health/debug). */
export function getActiveTrackingCount(): number {
  return activeTrackers.size;
}
