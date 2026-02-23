/**
 * Analytics REST endpoints
 *
 * Exposes trade analytics data, strategy recommendations, and
 * performance summaries for the dashboard.
 */
import { Router } from "express";
import prisma from "../db/client";
import { requireAuth } from "../middleware/auth";
import { getAllStrategies, recomputeStrategies } from "../services/strategyEngine";
import { getActiveTrackingCount } from "../services/priceTracker";

const router = Router();

// ── Strategy recommendations ─────────────────────────────────────────────

/** Get all current strategy rules (what the engine recommends per category). */
router.get("/strategies", requireAuth, (_req, res) => {
  res.json(getAllStrategies());
});

/** Force a strategy recompute (useful after manual data imports). */
router.post("/strategies/recompute", requireAuth, async (_req, res) => {
  await recomputeStrategies();
  res.json({ ok: true, strategies: getAllStrategies() });
});

// ── Trade analytics with snapshots ───────────────────────────────────────

/** List all analytics records with their price snapshot curves. */
router.get("/trades", requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
  const category = req.query.category as string | undefined;

  const where = category ? { catalystCategory: category } : {};

  const trades = await prisma.tradeAnalytics.findMany({
    where,
    include: {
      priceSnapshots: { orderBy: { offsetSeconds: "asc" } },
      paperTrade: { select: { pnl: true, sellStatus: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  res.json(trades);
});

/** Get a single trade's full analytics + snapshots. */
router.get("/trades/:id", requireAuth, async (req, res) => {
  const trade = await prisma.tradeAnalytics.findUnique({
    where: { id: req.params.id },
    include: {
      priceSnapshots: { orderBy: { offsetSeconds: "asc" } },
      paperTrade: true,
    },
  });

  if (!trade) { res.status(404).json({ error: "Not found" }); return; }
  res.json(trade);
});

// ── Performance summaries ────────────────────────────────────────────────

/** Aggregate performance by catalyst category. */
router.get("/performance/by-category", requireAuth, async (_req, res) => {
  const trades = await prisma.tradeAnalytics.findMany({
    where: { returnPct: { not: null } },
    select: {
      catalystCategory: true,
      catalystTier: true,
      returnPct: true,
      actualHoldSec: true,
      maxDrawdownPct: true,
      peakTimeOffsetSec: true,
      relativeVolume: true,
    },
  });

  // Group by category
  const groups = new Map<string, typeof trades>();
  for (const t of trades) {
    const arr = groups.get(t.catalystCategory) ?? [];
    arr.push(t);
    groups.set(t.catalystCategory, arr);
  }

  const summary = [...groups.entries()].map(([category, items]) => {
    const returns = items.map((t) => t.returnPct!);
    const sorted = [...returns].sort((a, b) => a - b);
    const wins = returns.filter((r) => r > 0).length;

    return {
      category,
      tier: items[0].catalystTier,
      tradeCount: items.length,
      avgReturn: mean(returns),
      medianReturn: median(sorted),
      winRate: wins / items.length,
      avgHoldSec: mean(items.map((t) => t.actualHoldSec ?? 0)),
      avgDrawdown: mean(items.filter((t) => t.maxDrawdownPct != null).map((t) => t.maxDrawdownPct!)),
      avgTimeToPeakSec: mean(
        items.filter((t) => t.peakTimeOffsetSec != null).map((t) => t.peakTimeOffsetSec!)
      ),
      avgRelativeVolume: mean(items.map((t) => t.relativeVolume)),
    };
  });

  res.json(summary);
});

/** Return curve data: average return at each snapshot interval, grouped by category. */
router.get("/performance/curves", requireAuth, async (_req, res) => {
  const trades = await prisma.tradeAnalytics.findMany({
    where: { returnPct: { not: null } },
    include: {
      priceSnapshots: { orderBy: { offsetSeconds: "asc" } },
    },
  });

  // Group snapshots by category → offset → returns
  const curves = new Map<string, Map<number, number[]>>();

  for (const trade of trades) {
    const cat = trade.catalystCategory;
    if (!curves.has(cat)) curves.set(cat, new Map());
    const catMap = curves.get(cat)!;

    for (const snap of trade.priceSnapshots) {
      const arr = catMap.get(snap.offsetSeconds) ?? [];
      arr.push(snap.returnPct);
      catMap.set(snap.offsetSeconds, arr);
    }
  }

  // Convert to response format
  const result: Record<
    string,
    Array<{ offsetSeconds: number; avgReturn: number; medianReturn: number; count: number }>
  > = {};

  for (const [cat, offsets] of curves.entries()) {
    result[cat] = [...offsets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([offset, returns]) => ({
        offsetSeconds: offset,
        avgReturn: mean(returns),
        medianReturn: median([...returns].sort((a, b) => a - b)),
        count: returns.length,
      }));
  }

  res.json(result);
});

// ── System status ────────────────────────────────────────────────────────

router.get("/status", requireAuth, async (_req, res) => {
  const totalTrades = await prisma.tradeAnalytics.count();
  const completedTrades = await prisma.tradeAnalytics.count({
    where: { returnPct: { not: null } },
  });
  const strategyRules = await prisma.strategyRule.count();

  res.json({
    totalTrades,
    completedTrades,
    activeTracking: getActiveTrackingCount(),
    strategyRules,
    strategies: getAllStrategies(),
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export default router;
