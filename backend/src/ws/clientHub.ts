import { WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { config } from "../config";

export interface DashClient {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>; // e.g. "scanner:gap_up", "news", "quotes:AAPL"
}

const clients = new Map<WebSocket, DashClient>();

export function addClient(ws: WebSocket) {
  // First message must be auth
  ws.once("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type: string; token: string };
      if (msg.type !== "auth" || !msg.token) {
        ws.close(4001, "Auth required");
        return;
      }
      const payload = jwt.verify(msg.token, config.jwtSecret) as { sub: string };
      const client: DashClient = { ws, userId: payload.sub, subscriptions: new Set() };
      clients.set(ws, client);

      ws.send(JSON.stringify({ type: "connected" }));

      ws.on("message", (data) => handleMessage(client, data.toString()));
      ws.on("close", () => clients.delete(ws));
    } catch {
      ws.close(4001, "Invalid token");
    }
  });
}

function handleMessage(client: DashClient, raw: string) {
  try {
    const msg = JSON.parse(raw) as { type: string; [key: string]: unknown };
    if (msg.type === "subscribe") {
      const channel = msg.channel as string;
      if (channel) client.subscriptions.add(channel);
    } else if (msg.type === "unsubscribe") {
      const channel = msg.channel as string;
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
