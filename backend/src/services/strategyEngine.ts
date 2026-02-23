/**
 * Strategy Engine
 *
 * Analyzes historical trade data to determine optimal hold times and
 * trailing stop percentages per catalyst category / market cap / time-of-day.
 *
 * Phase 1 (< 50 trades):  Percentile-based — find the snapshot interval
 *   where the median return peaks for each grouping.
 *
 * Phase 2 (50-200 trades): Exponential decay curve fitting — model the
 *   typical return curve and find the mathematical peak.
 *
 * Phase 3 (200+ trades): Multi-factor, extractable to Python sidecar.
 *
 * The engine recomputes after every N new trades (default 5) and caches
 * results both in-memory and in the StrategyRule table.
 */
import prisma from "../db/client";
import { getCapBucket, getTodBucket, type CapBucket, type TodBucket, type CatalystCategory } from "./catalystClassifier";

// ── Types ──────────────────────────────────────────────────────────────────

export interface StrategyRecommendation {
  holdDurationSec: number;
  trailingStopPct: number;
  confidence: number;     // 0-1
  sampleSize: number;
  avgReturnPct: number;
  medianReturnPct: number;
  winRate: number;
  phase: 1 | 2;
}

interface TradeDataPoint {
  catalystCategory: string;
  capBucket: CapBucket;
  todBucket: TodBucket;
  entryPrice: number;
  snapshots: { offsetSeconds: number; returnPct: number }[];
}

// ── In-memory strategy cache ───────────────────────────────────────────────

// Key format: "CATEGORY:CAP:TOD" e.g. "FDA_APPROVAL:SMALL:MARKET_OPEN"
const strategyCache = new Map<string, StrategyRecommendation>();

// Default strategy when we have no data for a grouping
const DEFAULT_STRATEGY: StrategyRecommendation = {
  holdDurationSec: 60,
  trailingStopPct: 3.0,
  confidence: 0,
  sampleSize: 0,
  avgReturnPct: 0,
  medianReturnPct: 0,
  winRate: 0,
  phase: 1,
};

// Recompute threshold
const RECOMPUTE_EVERY_N_TRADES = 5;
let tradesSinceLastCompute = 0;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the recommended strategy for a specific trade setup.
 * Looks up in order: exact match → category+cap → category → global default.
 */
export function getStrategy(
  catalystCategory: CatalystCategory,
  marketCap: number | null,
  tradeTime: Date
): StrategyRecommendation {
  const cap = getCapBucket(marketCap);
  const tod = getTodBucket(tradeTime);

  // Try increasingly broad lookups
  const keys = [
    `${catalystCategory}:${cap}:${tod}`,
    `${catalystCategory}:${cap}:ALL`,
    `${catalystCategory}:ALL:ALL`,
    `ALL:ALL:ALL`,
  ];

  for (const key of keys) {
    const cached = strategyCache.get(key);
    if (cached && cached.sampleSize >= 3) return cached;
  }

  return DEFAULT_STRATEGY;
}

/**
 * Signal that a new trade has completed. Triggers recompute if threshold reached.
 */
export async function onTradeCompleted(): Promise<void> {
  tradesSinceLastCompute++;
  if (tradesSinceLastCompute >= RECOMPUTE_EVERY_N_TRADES) {
    tradesSinceLastCompute = 0;
    await recomputeStrategies();
  }
}

/**
 * Force a full recompute of all strategies. Called on startup and periodically.
 */
export async function recomputeStrategies(): Promise<void> {
  console.log("[StrategyEngine] Recomputing strategies...");

  try {
    // Load all completed trades with their snapshots
    const trades = await prisma.tradeAnalytics.findMany({
      where: { returnPct: { not: null } },
      include: {
        priceSnapshots: { orderBy: { offsetSeconds: "asc" } },
      },
    });

    if (trades.length === 0) {
      console.log("[StrategyEngine] No completed trades yet — using defaults");
      return;
    }

    // Convert to data points
    const dataPoints: TradeDataPoint[] = trades.map((t) => ({
      catalystCategory: t.catalystCategory,
      capBucket: getCapBucket(t.marketCap),
      todBucket: getTodBucket(t.tradeEnteredAt),
      entryPrice: t.entryPrice,
      snapshots: t.priceSnapshots.map((s) => ({
        offsetSeconds: s.offsetSeconds,
        returnPct: s.returnPct,
      })),
    }));

    // Group by various levels
    const groups = buildGroups(dataPoints);

    // Compute strategy for each group
    const newRules: Array<{
      key: string;
      category: string;
      cap: string;
      tod: string;
      strategy: StrategyRecommendation;
    }> = [];

    for (const [key, points] of groups.entries()) {
      if (points.length < 3) continue; // need minimum 3 trades

      const strategy =
        points.length >= 50
          ? computePhase2Strategy(points)
          : computePhase1Strategy(points);

      const [category, cap, tod] = key.split(":");
      newRules.push({ key, category, cap, tod, strategy });
      strategyCache.set(key, strategy);
    }

    // Also compute the global fallback
    if (dataPoints.length >= 3) {
      const globalStrategy =
        dataPoints.length >= 50
          ? computePhase2Strategy(dataPoints)
          : computePhase1Strategy(dataPoints);
      strategyCache.set("ALL:ALL:ALL", globalStrategy);

      newRules.push({
        key: "ALL:ALL:ALL",
        category: "ALL",
        cap: "ALL",
        tod: "ALL",
        strategy: globalStrategy,
      });
    }

    // Persist to database
    for (const rule of newRules) {
      await prisma.strategyRule.upsert({
        where: {
          catalystCategory_capBucket_todBucket: {
            catalystCategory: rule.category,
            capBucket: rule.cap,
            todBucket: rule.tod,
          },
        },
        create: {
          catalystCategory: rule.category,
          capBucket: rule.cap,
          todBucket: rule.tod,
          holdDurationSec: rule.strategy.holdDurationSec,
          trailingStopPct: rule.strategy.trailingStopPct,
          confidence: rule.strategy.confidence,
          sampleSize: rule.strategy.sampleSize,
          avgReturnPct: rule.strategy.avgReturnPct,
          medianReturnPct: rule.strategy.medianReturnPct,
          winRate: rule.strategy.winRate,
        },
        update: {
          holdDurationSec: rule.strategy.holdDurationSec,
          trailingStopPct: rule.strategy.trailingStopPct,
          confidence: rule.strategy.confidence,
          sampleSize: rule.strategy.sampleSize,
          avgReturnPct: rule.strategy.avgReturnPct,
          medianReturnPct: rule.strategy.medianReturnPct,
          winRate: rule.strategy.winRate,
          computedAt: new Date(),
        },
      });
    }

    console.log(
      `[StrategyEngine] Recomputed ${newRules.length} rules from ${trades.length} trades`
    );
  } catch (err) {
    console.error(
      "[StrategyEngine] Recompute error:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Load persisted strategies from DB on startup.
 */
export async function loadStrategiesFromDb(): Promise<void> {
  try {
    const rules = await prisma.strategyRule.findMany();
    for (const rule of rules) {
      const key = `${rule.catalystCategory}:${rule.capBucket}:${rule.todBucket}`;
      strategyCache.set(key, {
        holdDurationSec: rule.holdDurationSec,
        trailingStopPct: rule.trailingStopPct,
        confidence: rule.confidence,
        sampleSize: rule.sampleSize,
        avgReturnPct: rule.avgReturnPct,
        medianReturnPct: rule.medianReturnPct,
        winRate: rule.winRate,
        phase: rule.sampleSize >= 50 ? 2 : 1,
      });
    }
    console.log(`[StrategyEngine] Loaded ${rules.length} strategy rules from DB`);
  } catch {
    // Table might not exist yet during first run
    console.log("[StrategyEngine] No persisted strategies found — using defaults");
  }
}

/** Get all cached strategies (for REST endpoint). */
export function getAllStrategies(): Record<string, StrategyRecommendation> {
  return Object.fromEntries(strategyCache);
}

// ── Phase 1: Percentile-based (< 50 trades per group) ─────────────────────

function computePhase1Strategy(points: TradeDataPoint[]): StrategyRecommendation {
  // For each snapshot interval, collect the returns across all trades in this group
  const intervalReturns = new Map<number, number[]>();

  for (const point of points) {
    for (const snap of point.snapshots) {
      const arr = intervalReturns.get(snap.offsetSeconds) ?? [];
      arr.push(snap.returnPct);
      intervalReturns.set(snap.offsetSeconds, arr);
    }
  }

  // Find the interval where the median return is highest
  let bestInterval = 60; // default 1 minute
  let bestMedian = -Infinity;
  const intervalStats: Array<{
    offset: number;
    median: number;
    avg: number;
    winRate: number;
  }> = [];

  for (const [offset, returns] of intervalReturns.entries()) {
    if (returns.length < 2) continue; // need at least 2 data points
    const sorted = [...returns].sort((a, b) => a - b);
    const med = median(sorted);
    const avg = mean(returns);
    const wins = returns.filter((r) => r > 0).length;

    intervalStats.push({
      offset,
      median: med,
      avg,
      winRate: wins / returns.length,
    });

    if (med > bestMedian) {
      bestMedian = med;
      bestInterval = offset;
    }
  }

  // Compute trailing stop based on typical drawdown from peak
  const drawdowns: number[] = [];
  for (const point of points) {
    let peak = 0;
    for (const snap of point.snapshots) {
      if (snap.returnPct > peak) peak = snap.returnPct;
      if (snap.offsetSeconds > bestInterval) break;
    }
    // Drawdown = peak - final return at best interval
    const atBest = point.snapshots.find((s) => s.offsetSeconds === bestInterval);
    if (atBest && peak > 0) {
      drawdowns.push(peak - atBest.returnPct);
    }
  }

  // Set trailing stop at 1.5x the median drawdown (or 3% minimum)
  const trailingStopPct = Math.max(
    3.0,
    drawdowns.length > 0 ? median(drawdowns.sort((a, b) => a - b)) * 1.5 : 3.0
  );

  // Confidence based on sample size (asymptotically approaches 1)
  const n = points.length;
  const confidence = 1 - 1 / (1 + n / 10); // 10 trades → 0.5, 30 → 0.75, 100 → 0.91

  // Overall stats at the best interval
  const returnsAtBest = intervalReturns.get(bestInterval) ?? [];
  const avgReturn = returnsAtBest.length > 0 ? mean(returnsAtBest) : 0;
  const medReturn = returnsAtBest.length > 0 ? median(returnsAtBest.sort((a, b) => a - b)) : 0;
  const winRate =
    returnsAtBest.length > 0
      ? returnsAtBest.filter((r) => r > 0).length / returnsAtBest.length
      : 0;

  return {
    holdDurationSec: bestInterval,
    trailingStopPct,
    confidence,
    sampleSize: n,
    avgReturnPct: avgReturn,
    medianReturnPct: medReturn,
    winRate,
    phase: 1,
  };
}

// ── Phase 2: Curve fitting (>= 50 trades per group) ───────────────────────

function computePhase2Strategy(points: TradeDataPoint[]): StrategyRecommendation {
  // Fit a simple model: returnPct(t) peaks and then decays
  // Approach: weighted interpolation to find optimal exit point
  //
  // For each interval, compute: median return, and its rate of change.
  // Optimal exit = where the marginal gain turns negative (return starts declining).

  const intervalReturns = new Map<number, number[]>();
  for (const point of points) {
    for (const snap of point.snapshots) {
      const arr = intervalReturns.get(snap.offsetSeconds) ?? [];
      arr.push(snap.returnPct);
      intervalReturns.set(snap.offsetSeconds, arr);
    }
  }

  // Build the return curve (sorted by time)
  const curve: Array<{ offset: number; median: number; avg: number }> = [];
  const sortedOffsets = [...intervalReturns.keys()].sort((a, b) => a - b);

  for (const offset of sortedOffsets) {
    const returns = intervalReturns.get(offset)!;
    const sorted = [...returns].sort((a, b) => a - b);
    curve.push({
      offset,
      median: median(sorted),
      avg: mean(returns),
    });
  }

  if (curve.length < 2) return computePhase1Strategy(points);

  // Find the peak of the median return curve
  let peakIdx = 0;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].median > curve[peakIdx].median) peakIdx = i;
  }

  // Refine: if the return is still increasing at the last interval,
  // use the last interval (momentum still running).
  // If it peaks early and declines, use the peak.
  const bestInterval = curve[peakIdx].offset;

  // Compute trailing stop using the decay rate after peak
  // Average the drops from peak to subsequent intervals
  const peakMedian = curve[peakIdx].median;
  const postPeakDrops: number[] = [];
  for (let i = peakIdx + 1; i < curve.length; i++) {
    postPeakDrops.push(peakMedian - curve[i].median);
  }

  // Use the 75th percentile drop as the trailing stop
  const trailingStopPct = Math.max(
    2.0,
    postPeakDrops.length > 0
      ? percentile(postPeakDrops.sort((a, b) => a - b), 0.75)
      : 3.0
  );

  const n = points.length;
  const confidence = 1 - 1 / (1 + n / 10);

  const returnsAtBest = intervalReturns.get(bestInterval) ?? [];
  const avgReturn = returnsAtBest.length > 0 ? mean(returnsAtBest) : 0;
  const medReturn = returnsAtBest.length > 0 ? median(returnsAtBest.sort((a, b) => a - b)) : 0;
  const winRate =
    returnsAtBest.length > 0
      ? returnsAtBest.filter((r) => r > 0).length / returnsAtBest.length
      : 0;

  return {
    holdDurationSec: bestInterval,
    trailingStopPct,
    confidence,
    sampleSize: n,
    avgReturnPct: avgReturn,
    medianReturnPct: medReturn,
    winRate,
    phase: 2,
  };
}

// ── Grouping logic ─────────────────────────────────────────────────────────

function buildGroups(
  points: TradeDataPoint[]
): Map<string, TradeDataPoint[]> {
  const groups = new Map<string, TradeDataPoint[]>();

  for (const point of points) {
    // Exact grouping: category + cap + tod
    const exactKey = `${point.catalystCategory}:${point.capBucket}:${point.todBucket}`;
    pushTo(groups, exactKey, point);

    // Category + cap
    const catCapKey = `${point.catalystCategory}:${point.capBucket}:ALL`;
    pushTo(groups, catCapKey, point);

    // Category only
    const catKey = `${point.catalystCategory}:ALL:ALL`;
    pushTo(groups, catKey, point);
  }

  return groups;
}

function pushTo(map: Map<string, TradeDataPoint[]>, key: string, val: TradeDataPoint) {
  const arr = map.get(key) ?? [];
  arr.push(val);
  map.set(key, arr);
}

// ── Math helpers ───────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}
