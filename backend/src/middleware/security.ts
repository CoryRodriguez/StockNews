import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// ── Request ID middleware ─────────────────────────────────────────────────
// Adds a unique request ID to every request for traceability / audit trail

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = crypto.randomUUID();
  req.headers["x-request-id"] = id;
  res.setHeader("X-Request-Id", id);
  next();
}

// ── Security event logger ─────────────────────────────────────────────────
// Structured security event logging for audit trail

export type SecurityEventType =
  | "AUTH_FAILED"
  | "AUTH_SUCCESS"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "RATE_LIMITED"
  | "CONFIG_CHANGED"
  | "BOT_STATE_CHANGED"
  | "MODE_SWITCHED"
  | "FORBIDDEN"
  | "INPUT_VALIDATION_FAILED"
  | "WS_AUTH_FAILED"
  | "WS_CONNECTED"
  | "WS_DISCONNECTED";

interface SecurityEvent {
  timestamp: string;
  type: SecurityEventType;
  ip: string;
  requestId?: string;
  userId?: string;
  details?: Record<string, unknown>;
}

export function logSecurityEvent(
  req: Request,
  type: SecurityEventType,
  details?: Record<string, unknown>
) {
  const event: SecurityEvent = {
    timestamp: new Date().toISOString(),
    type,
    ip: req.ip ?? req.socket.remoteAddress ?? "unknown",
    requestId: req.headers["x-request-id"] as string,
    userId: (req as any).userId,
    details,
  };
  console.log(`[SECURITY] ${JSON.stringify(event)}`);
}

// Standalone version for WebSocket events (no Request object)
export function logSecurityEventRaw(
  type: SecurityEventType,
  ip: string,
  details?: Record<string, unknown>
) {
  const event: SecurityEvent = {
    timestamp: new Date().toISOString(),
    type,
    ip,
    details,
  };
  console.log(`[SECURITY] ${JSON.stringify(event)}`);
}

// ── JSON body size limiter ────────────────────────────────────────────────
// Prevents unbounded resource consumption via oversized payloads

export function jsonSizeLimit(limit: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers["content-length"] ?? "0");
    const maxBytes = parseSize(limit);
    if (contentLength > maxBytes) {
      res.status(413).json({ error: "Payload too large" });
      return;
    }
    next();
  };
}

function parseSize(s: string): number {
  const match = s.match(/^(\d+)(kb|mb)$/i);
  if (!match) return 1048576; // default 1MB
  const num = parseInt(match[1]);
  return match[2].toLowerCase() === "kb" ? num * 1024 : num * 1048576;
}
