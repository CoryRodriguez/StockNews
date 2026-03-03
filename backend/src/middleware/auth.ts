import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { logSecurityEvent } from "./security";

export interface AuthRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    logSecurityEvent(req, "TOKEN_INVALID", { reason: "missing_header" });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch (err) {
    const isExpired = err instanceof jwt.TokenExpiredError;
    logSecurityEvent(req, isExpired ? "TOKEN_EXPIRED" : "TOKEN_INVALID", {
      reason: isExpired ? "expired" : "invalid_signature",
    });
    res.status(401).json({ error: isExpired ? "Token expired" : "Invalid token" });
  }
}
