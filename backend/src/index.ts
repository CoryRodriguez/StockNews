import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { addClient } from "./ws/clientHub";
import { startRtpr } from "./services/rtpr";
import { startAlpacaWs } from "./services/alpaca";
import { startScanner, getScannerDefinitions } from "./services/scanner";
import { recentArticles } from "./services/rtpr";
import authRouter from "./routes/auth";
import watchlistsRouter from "./routes/watchlists";
import layoutsRouter from "./routes/layouts";
import tradesRouter from "./routes/trades";
import { requireAuth } from "./middleware/auth";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/watchlists", watchlistsRouter);
app.use("/api/layouts", layoutsRouter);
app.use("/api/trades", tradesRouter);

// Scanner definitions (no auth needed — public metadata)
app.get("/api/scanners", (_req, res) => {
  res.json(getScannerDefinitions());
});

// Recent news REST fallback
app.get("/api/news/recent", requireAuth, (_req, res) => {
  res.json(recentArticles.slice(0, 50));
});

app.get("/api/news/ticker/:symbol", requireAuth, (req, res) => {
  const sym = req.params.symbol.toUpperCase();
  res.json(recentArticles.filter((a) => a.ticker === sym).slice(0, 20));
});

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ── HTTP + WebSocket server ───────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => addClient(ws));

server.listen(config.port, () => {
  console.log(`[Server] Listening on :${config.port}`);
  startRtpr();
  startAlpacaWs();
  startScanner();
});
