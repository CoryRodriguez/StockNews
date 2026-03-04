import { WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { logSecurityEventRaw } from "../middleware/security";

// ── Constants ────────────────────────────────────────────────────────────
const MAX_MESSAGE_SIZE = 4096; // 4KB max per WS message
const AUTH_TIMEOUT_MS = 5000; // 5s to authenticate or disconnect
const TOKEN_REVALIDATE_MS = 5 * 60 * 1000; // re-verify token every 5 min
const MAX_SUBSCRIPTIONS = 50; // cap subscriptions per client
const VALID_CHANNELS = /^(scanner:[a-z_]+|news|bot|trades|screener|scanner_control|catalyst|quotes:[A-Z0-9.]{1,10})$/;

export interface DashClient {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>;
  revalidateTimer?: ReturnType<typeof setInterval>;
  token: string; // store token for periodic re-validation
}

const clients = new Map<WebSocket, DashClient>();

function getClientIp(ws: WebSocket): string {
  const socket = (ws as any)._socket;
  return socket?.remoteAddress ?? "unknown";
}

export function addClient(ws: WebSocket) {
  const ip = getClientIp(ws);

  // Enforce auth timeout — close if no auth within 5s
  const authTimeout = setTimeout(() => {
    if (!clients.has(ws)) {
      logSecurityEventRaw("WS_AUTH_FAILED", ip, { reason: "auth_timeout" });
      ws.close(4001, "Auth timeout");
    }
  }, AUTH_TIMEOUT_MS);

  // First message must be auth
  ws.once("message", (raw) => {
    clearTimeout(authTimeout);

    // Message size check
    const rawStr = raw.toString();
    if (rawStr.length > MAX_MESSAGE_SIZE) {
      ws.close(4008, "Message too large");
      return;
    }

    try {
      const msg = JSON.parse(rawStr) as { type: string; token: string };
      if (msg.type !== "auth" || !msg.token) {
        logSecurityEventRaw("WS_AUTH_FAILED", ip, { reason: "missing_token" });
        ws.close(4001, "Auth required");
        return;
      }
      const payload = jwt.verify(msg.token, config.jwtSecret) as { sub: string };
      const client: DashClient = {
        ws,
        userId: payload.sub,
        subscriptions: new Set(),
        token: msg.token,
      };

      // Periodic token re-validation
      client.revalidateTimer = setInterval(() => {
        try {
          jwt.verify(client.token, config.jwtSecret);
        } catch {
          logSecurityEventRaw("TOKEN_EXPIRED", ip, {
            userId: client.userId,
            context: "ws_revalidation",
          });
          ws.close(4001, "Token expired");
        }
      }, TOKEN_REVALIDATE_MS);

      clients.set(ws, client);
      logSecurityEventRaw("WS_CONNECTED", ip, { userId: payload.sub });

      ws.send(JSON.stringify({ type: "connected" }));

      ws.on("message", (data) => {
        const str = data.toString();
        if (str.length > MAX_MESSAGE_SIZE) return; // silently drop oversized messages
        handleMessage(client, str);
      });
      ws.on("close", () => {
        if (client.revalidateTimer) clearInterval(client.revalidateTimer);
        clients.delete(ws);
        logSecurityEventRaw("WS_DISCONNECTED", ip, { userId: client.userId });
      });
    } catch {
      logSecurityEventRaw("WS_AUTH_FAILED", ip, { reason: "invalid_token" });
      ws.close(4001, "Invalid token");
    }
  });
}

function handleMessage(client: DashClient, raw: string) {
  try {
    const msg = JSON.parse(raw) as { type: string; [key: string]: unknown };
    if (msg.type === "subscribe") {
      const channel = String(msg.channel ?? "");
      // Validate channel name format
      if (!channel || !VALID_CHANNELS.test(channel)) return;
      // Enforce subscription cap
      if (client.subscriptions.size >= MAX_SUBSCRIPTIONS) return;
      client.subscriptions.add(channel);
    } else if (msg.type === "unsubscribe") {
      const channel = String(msg.channel ?? "");
      if (channel) client.subscriptions.delete(channel);
    }
  } catch {
    // ignore malformed messages
  }
}

/** Broadcast a message to all authenticated clients subscribed to a channel */
export function broadcast(channel: string, payload: object) {
  const message = JSON.stringify({ channel, ...payload });
  for (const [ws, client] of clients) {
    if (ws.readyState === WebSocket.OPEN && client.subscriptions.has(channel)) {
      ws.send(message);
    }
  }
}

/** Broadcast to ALL authenticated clients regardless of subscriptions */
export function broadcastAll(payload: object) {
  const message = JSON.stringify(payload);
  for (const [ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}
