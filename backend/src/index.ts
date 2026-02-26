import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { addClient } from "./ws/clientHub";
import { startRtpr } from "./services/rtpr";
import { startBenzinga } from "./services/benzinga";
import { startAlpacaWs } from "./services/alpaca";
import { startAlpacaNews } from "./services/alpacaNews";
import { startScanner, getScannerDefinitions } from "./services/scanner";
import { recentArticles } from "./services/rtpr";
import { getSnapshots } from "./services/alpaca";
import authRouter from "./routes/auth";
import watchlistsRouter from "./routes/watchlists";
import layoutsRouter from "./routes/layouts";
import tradesRouter from "./routes/trades";
import analyticsRouter from "./routes/analytics";
import { requireAuth } from "./middleware/auth";
import { loadStrategiesFromDb, recomputeStrategies } from "./services/strategyEngine";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/watchlists", watchlistsRouter);
app.use("/api/layouts", layoutsRouter);
app.use("/api/trades", tradesRouter);
app.use("/api/analytics", analyticsRouter);

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

// Snapshot data for watchlist tickers
app.get("/api/snapshots", requireAuth, async (req, res) => {
  const symbols = String(req.query.symbols ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);
  if (!symbols.length) { res.json([]); return; }
  const data = await getSnapshots(symbols);
  res.json(data);
});

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ── HTTP + WebSocket server ───────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => addClient(ws));

server.listen(config.port, async () => {
  console.log(`[Server] Listening on :${config.port}`);
  startRtpr();
  startBenzinga();
  startAlpacaNews();
  startAlpacaWs();
  startScanner();

  // Load persisted strategy rules into memory, then do a fresh recompute
  await loadStrategiesFromDb();
  await recomputeStrategies();

  // Recompute strategies every hour in case server has been up a long time
  setInterval(() => recomputeStrategies(), 60 * 60 * 1000);
});
