import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../db/client";
import { config } from "../config";

const router = Router();

// First-time setup — only works if no user exists yet
router.post("/setup", async (req: Request, res: Response) => {
  const count = await prisma.user.count();
  if (count > 0) {
    res.status(403).json({ error: "Already set up" });
    return;
  }
  const { password } = req.body as { password?: string };
  if (!password || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { password: hashed } });
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: "30d" });
  res.json({ token });
});

router.post("/login", async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }
  const user = await prisma.user.findFirst();
  if (!user) {
    res.status(403).json({ error: "Not set up yet", needsSetup: true });
    return;
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: "Wrong password" });
    return;
  }
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: "30d" });
  res.json({ token });
});

router.get("/status", async (_req: Request, res: Response) => {
  const count = await prisma.user.count();
  res.json({ needsSetup: count === 0 });
});

export default router;
