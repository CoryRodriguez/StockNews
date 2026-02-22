import { Router, Response } from "express";
import prisma from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req: AuthRequest, res: Response) => {
  const layouts = await prisma.layout.findMany({ orderBy: { createdAt: "asc" } });
  res.json(layouts);
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, panels } = req.body as { name: string; panels: unknown };
  if (!name) { res.status(400).json({ error: "Name required" }); return; }
  const layout = await prisma.layout.create({ data: { name, panels: panels ?? [] } });
  res.json(layout);
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { name, panels } = req.body as { name?: string; panels?: unknown };
  const layout = await prisma.layout.update({
    where: { id: req.params.id },
    data: { ...(name && { name }), ...(panels != null && { panels }) },
  });
  res.json(layout);
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  await prisma.layout.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
