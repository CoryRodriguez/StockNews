import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import prisma from "../db/client";
import { config } from "../config";
import { logSecurityEvent } from "../middleware/security";

const router = Router();

// ── Rate limiting for auth endpoints ─────────────────────────────────────
// Strict: 5 attempts per 15 minutes per IP to prevent brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  handler: (req, res) => {
    logSecurityEvent(req, "RATE_LIMITED", { endpoint: req.path });
    res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
  },
});

// ── Password strength validation ─────────────────────────────────────────
function validatePasswordStrength(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  return null;
}

// First-time setup — only works if no user exists yet
router.post("/setup", authLimiter, async (req: Request, res: Response) => {
  const count = await prisma.user.count();
  if (count > 0) {
    res.status(403).json({ error: "Already set up" });
    return;
  }
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }
  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    logSecurityEvent(req, "INPUT_VALIDATION_FAILED", { reason: "weak_password" });
    res.status(400).json({ error: strengthError });
    return;
  }
  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { password: hashed } });
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  });
  logSecurityEvent(req, "AUTH_SUCCESS", { action: "setup" });
  res.json({ token });
});

router.post("/login", authLimiter, async (req: Request, res: Response) => {
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
    logSecurityEvent(req, "AUTH_FAILED", { reason: "wrong_password" });
    res.status(401).json({ error: "Wrong password" });
    return;
  }
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  });
  logSecurityEvent(req, "AUTH_SUCCESS", { action: "login" });
  res.json({ token });
});

router.get("/status", async (_req: Request, res: Response) => {
  const count = await prisma.user.count();
  res.json({ needsSetup: count === 0 });
});

// ── Emergency password reset ─────────────────────────────────────────────
// Triggered by setting RESET_PASSWORD env var and hitting this endpoint.
// Usage: set RESET_PASSWORD=<new-password> in .env, restart, hit POST /api/auth/reset-password,
// then remove the env var and restart again.
router.post("/reset-password", authLimiter, async (req: Request, res: Response) => {
  const resetPassword = process.env.RESET_PASSWORD;
  if (!resetPassword) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const strengthError = validatePasswordStrength(resetPassword);
  if (strengthError) {
    res.status(400).json({ error: `RESET_PASSWORD env var: ${strengthError}` });
    return;
  }

  const user = await prisma.user.findFirst();
  if (!user) {
    res.status(403).json({ error: "No user exists" });
    return;
  }

  const hashed = await bcrypt.hash(resetPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

  logSecurityEvent(req, "AUTH_SUCCESS", { action: "password_reset_via_env" });
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  });
  res.json({ ok: true, message: "Password reset. Remove RESET_PASSWORD from .env and restart.", token });
});

export default router;
