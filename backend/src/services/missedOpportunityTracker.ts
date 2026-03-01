/**
 * Missed Opportunity Tracker
 *
 * After a signal is rejected, watches the stock's price for 30 minutes.
 * If the price moves +5% or more from the rejection price, records the peak
 * percentage in BotSignalLog.postRejectPeakPct for EOD recap analysis.
 *
 * Design choices:
 * - Single shared polling interval (not one per watch) — prevents Alpaca rate
 *   limit issues from spawning too many concurrent interval timers.
 * - Batches all watched symbols into ONE getSnapshots call per poll cycle.
 * - MAX_CONCURRENT_WATCHES cap prevents memory growth on high-volume days.
 *
 * Leaf service — no upstream service imports (except alpaca.ts + prisma).
 * Circular dependency prevention: does NOT import signalEngine, tradeExecutor,
 * positionMonitor, or botController.
 */

import prisma from '../db/client';
import { getSnapshots } from './alpaca';

const WATCH_DURATION_MS = 30 * 60 * 1000;   // 30 minutes
const POLL_INTERVAL_MS  = 60 * 1000;          // every 60 seconds
const MISSED_OPP_THRESHOLD = 5.0;             // +5% = missed opportunity
const MAX_CONCURRENT_WATCHES = 50;            // cap to prevent memory issues

interface WatchEntry {
  signalLogId: string;
  symbol: string;
  priceAtRejection: number;
  startedAt: number;
  peakPct: number;
}

const watches = new Map<string, WatchEntry>(); // key = signalLogId

/**
 * Start watching a rejected signal's price for 30 minutes.
 * Called from signalEngine.ts after writeSignalLog() for non-silent rejections.
 * Leaf service — no upstream service imports (circular dependency prevention).
 *
 * @param signalLogId  BotSignalLog.id — used as the map key and for DB update
 * @param symbol       Ticker symbol to watch
 * @param priceAtRejection  Price at the moment of rejection (>0 required)
 */
export function startMissedOpportunityWatch(
  signalLogId: string,
  symbol: string,
  priceAtRejection: number
): void {
  if (priceAtRejection <= 0 || watches.has(signalLogId)) return;
  if (watches.size >= MAX_CONCURRENT_WATCHES) {
    console.log(`[MissedOppTracker] At capacity (${MAX_CONCURRENT_WATCHES}), skipping watch for ${symbol}`);
    return;
  }

  watches.set(signalLogId, {
    signalLogId,
    symbol,
    priceAtRejection,
    startedAt: Date.now(),
    peakPct: 0,
  });
  console.log(`[MissedOppTracker] Watching ${symbol} (signal ${signalLogId.slice(0, 8)}…) for 30 min`);
}

/**
 * Single shared polling loop — batches all watched symbols into one getSnapshots call.
 * Mirrors positionMonitor.ts single-loop pattern. Prevents Alpaca rate limit issues.
 *
 * On each tick:
 *  1. Separate expired entries (>= 30 min old) from active ones
 *  2. Write expired entries with peak >= 5% to BotSignalLog.postRejectPeakPct
 *  3. Poll active entries via a single batched getSnapshots() call
 *  4. Update peakPct in-memory for each active entry
 */
setInterval(async () => {
  if (watches.size === 0) return;

  const now = Date.now();
  const entries = [...watches.values()];

  // Separate expired entries
  const expired: WatchEntry[] = [];
  const active: WatchEntry[] = [];
  for (const e of entries) {
    if (now - e.startedAt >= WATCH_DURATION_MS) expired.push(e);
    else active.push(e);
  }

  // Write expired entries with significant moves to DB
  for (const e of expired) {
    watches.delete(e.signalLogId);
    if (e.peakPct >= MISSED_OPP_THRESHOLD) {
      try {
        await prisma.botSignalLog.update({
          where: { id: e.signalLogId },
          data: { postRejectPeakPct: e.peakPct },
        });
        console.log(`[MissedOppTracker] ${e.symbol} missed opportunity: +${e.peakPct.toFixed(1)}% peak`);
      } catch (err) {
        console.error(`[MissedOppTracker] DB write failed for ${e.signalLogId}:`, err);
      }
    }
  }

  // Poll active entries via single batched API call
  if (active.length === 0) return;
  const symbols = [...new Set(active.map(e => e.symbol))];
  try {
    const snaps = await getSnapshots(symbols);
    const priceMap = new Map(snaps.map(s => [s.ticker, s.price]));
    for (const e of active) {
      const currentPrice = priceMap.get(e.symbol);
      if (currentPrice != null) {
        const pct = ((currentPrice - e.priceAtRejection) / e.priceAtRejection) * 100;
        if (pct > e.peakPct) e.peakPct = pct;
      }
    }
  } catch (_err) {
    // Silently continue — snapshot failures are non-fatal for the tracker
  }
}, POLL_INTERVAL_MS);
