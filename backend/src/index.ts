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
import { startScanner, getScannerDefinitions, getCurrentAlerts } from "./services/scanner";
import { recentArticles, loadArticlesFromDb } from "./services/rtpr";
import { getSnapshots, getHourlyChanges } from "./services/alpaca";
import prisma from "./db/client";
import authRouter from "./routes/auth";
import watchlistsRouter from "./routes/watchlists";
import layoutsRouter from "./routes/layouts";
import tradesRouter from "./routes/trades";
import analyticsRouter from "./routes/analytics";
import botRouter from "./routes/bot";
import { requireAuth } from "./middleware/auth";
import { initBot } from "./services/botController";
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
app.use("/api/bot", botRouter);

// Scanner definitions (no auth needed — public metadata)
app.get("/api/scanners", (_req, res) => {
  res.json(getScannerDefinitions());
});

// Current scanner alert state (for hydrating clients on connect)
app.get("/api/scanner-alerts", requireAuth, (_req, res) => {
  res.json(getCurrentAlerts());
});

// Return today's news from DB (for persistence across restarts)
app.get("/api/news/recent", requireAuth, async (_req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const articles = await prisma.newsArticle.findMany({
      where: { receivedAt: { gte: startOfDay.toISOString() } },
      orderBy: { receivedAt: "desc" },
      take: 1000,
    });
    res.json(articles);
  } catch {
    res.json(recentArticles.slice(0, 200));
  }
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

// 1-hour % change for news article tickers
app.get("/api/hourly-changes", requireAuth, async (req, res) => {
  const symbols = String(req.query.symbols ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 100);
  if (!symbols.length) { res.json({}); return; }
  const data = await getHourlyChanges(symbols);
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
  await loadArticlesFromDb();
  startRtpr();
  startBenzinga();
  startAlpacaNews();
  startAlpacaWs();
  startScanner();

  // Load persisted strategy rules into memory, then do a fresh recompute
  await loadStrategiesFromDb();
  await recomputeStrategies();

  // Initialize bot controller (loads config, reconciles positions)
  // Must run AFTER strategy cache is warm so win-rate checks have data
  await initBot();

  // Recompute strategies every hour in case server has been up a long time
  setInterval(() => recomputeStrategies(), 60 * 60 * 1000);
});
