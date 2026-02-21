import { Router, Response } from "express";
import prisma from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req: AuthRequest, res: Response) => {
  const lists = await prisma.watchlist.findMany({ orderBy: { createdAt: "asc" } });
  res.json(lists);
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, tickers = [] } = req.body as { name: string; tickers?: string[] };
  if (!name) { res.status(400).json({ error: "Name required" }); return; }
  const list = await prisma.watchlist.create({ data: { name, tickers } });
  res.json(list);
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { name, tickers } = req.body as { name?: string; tickers?: string[] };
  const list = await prisma.watchlist.update({
    where: { id: req.params.id },
    data: { ...(name && { name }), ...(tickers && { tickers }) },
  });
  res.json(list);
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  await prisma.watchlist.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
