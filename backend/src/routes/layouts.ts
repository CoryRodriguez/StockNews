import { Router, Response } from "express";
import prisma from "../db/client";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// ── Input validation ─────────────────────────────────────────────────────
const MAX_NAME_LENGTH = 100;
const MAX_PANELS = 50;
const MAX_LAYOUT_JSON_SIZE = 64 * 1024; // 64KB per layout

router.get("/", async (_req: AuthRequest, res: Response) => {
  const layouts = await prisma.layout.findMany({ orderBy: { createdAt: "asc" } });
  res.json(layouts);
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, panels } = req.body as { name: string; panels: unknown };
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Name required" }); return;
  }
  if (name.length > MAX_NAME_LENGTH) {
    res.status(400).json({ error: `Name too long (max ${MAX_NAME_LENGTH} chars)` }); return;
  }
  // Validate panels payload size
  const panelsData = panels ?? [];
  if (Array.isArray(panelsData) && panelsData.length > MAX_PANELS) {
    res.status(400).json({ error: `Too many panels (max ${MAX_PANELS})` }); return;
  }
  if (JSON.stringify(panelsData).length > MAX_LAYOUT_JSON_SIZE) {
    res.status(400).json({ error: "Layout data too large" }); return;
  }
  const layout = await prisma.layout.create({ data: { name: name.trim(), panels: panelsData } });
  res.json(layout);
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { name, panels } = req.body as { name?: string; panels?: unknown };
  if (name && name.length > MAX_NAME_LENGTH) {
    res.status(400).json({ error: `Name too long (max ${MAX_NAME_LENGTH} chars)` }); return;
  }
  if (panels != null) {
    if (Array.isArray(panels) && panels.length > MAX_PANELS) {
      res.status(400).json({ error: `Too many panels (max ${MAX_PANELS})` }); return;
    }
    if (JSON.stringify(panels).length > MAX_LAYOUT_JSON_SIZE) {
      res.status(400).json({ error: "Layout data too large" }); return;
    }
  }
  try {
    const layout = await prisma.layout.update({
      where: { id: req.params.id },
      data: { ...(name && { name: name.trim() }), ...(panels != null && { panels }) },
    });
    res.json(layout);
  } catch {
    res.status(404).json({ error: "Layout not found" });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    await prisma.layout.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Layout not found" });
  }
});

export default router;
