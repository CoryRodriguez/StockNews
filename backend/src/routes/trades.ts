import { Router } from "express";
import { prisma } from "../db/client";
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

// Open positions: buy filled, sell not yet filled
router.get("/open", requireAuth, async (_req, res) => {
  const trades = await prisma.paperTrade.findMany({
    where: { buyStatus: "filled", sellStatus: { in: ["awaiting", "pending"] } },
    orderBy: { createdAt: "desc" },
  });
  res.json(trades);
});

export default router;
