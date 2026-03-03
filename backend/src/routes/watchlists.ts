import { Router, Response } from "express";
import prisma from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// ── Input validation ─────────────────────────────────────────────────────
const TICKER_PATTERN = /^[A-Z0-9.]{1,10}$/;
const MAX_NAME_LENGTH = 100;
const MAX_TICKERS = 200;

function sanitizeTickers(tickers: unknown[]): string[] {
  return tickers
    .map((t) => String(t).toUpperCase().trim())
    .filter((t) => TICKER_PATTERN.test(t))
    .slice(0, MAX_TICKERS);
}

router.get("/", async (_req: AuthRequest, res: Response) => {
  const lists = await prisma.watchlist.findMany({ orderBy: { createdAt: "asc" } });
  res.json(lists);
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, tickers = [] } = req.body as { name: string; tickers?: string[] };
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Name required" }); return;
  }
  if (name.length > MAX_NAME_LENGTH) {
    res.status(400).json({ error: `Name too long (max ${MAX_NAME_LENGTH} chars)` }); return;
  }
  const safeTickers = Array.isArray(tickers) ? sanitizeTickers(tickers) : [];
  const list = await prisma.watchlist.create({ data: { name: name.trim(), tickers: safeTickers } });
  res.json(list);
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { name, tickers } = req.body as { name?: string; tickers?: string[] };
  if (name && name.length > MAX_NAME_LENGTH) {
    res.status(400).json({ error: `Name too long (max ${MAX_NAME_LENGTH} chars)` }); return;
  }
  const safeTickers = tickers && Array.isArray(tickers) ? sanitizeTickers(tickers) : undefined;
  try {
    const list = await prisma.watchlist.update({
      where: { id: req.params.id },
      data: { ...(name && { name: name.trim() }), ...(safeTickers && { tickers: safeTickers }) },
    });
    res.json(list);
  } catch {
    res.status(404).json({ error: "Watchlist not found" });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    await prisma.watchlist.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Watchlist not found" });
  }
});

export default router;
