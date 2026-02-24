import { Router } from "express";
import prisma from "../db/client";
import { requireAuth } from "../middleware/auth";

const router = Router();

// All trade history (most recent 100)
router.get("/", requireAuth, async (_req, res) => {
  const trades = await prisma.paperTrade.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(trades);
});

// Rich journal: PaperTrade joined with analytics (for the Trades page)
router.get("/journal", requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "250")), 500);
  const trades = await prisma.paperTrade.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      analytics: {
        select: {
          catalystCategory: true,
          catalystTier: true,
          newsHeadline: true,
          tradeEnteredAt: true,
          entryPrice: true,
          exitPrice: true,
          returnPct: true,
          actualHoldSec: true,
          isPreMarket: true,
          relativeVolume: true,
          entryVwapDev: true,
          peakPrice: true,
          maxDrawdownPct: true,
        },
      },
    },
  });
  res.json(trades);
});

// Open positions: buy filled, sell not yet filled
router.get("/open", requireAuth, async (_req, res) => {
  const trades = await prisma.paperTrade.findMany({
    where: { buyStatus: "filled", sellStatus: { in: ["awaiting", "pending"] } },
    orderBy: { createdAt: "desc" },
  });
  res.json(trades);
});

export default router;
