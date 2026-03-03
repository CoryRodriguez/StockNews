import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { addClient } from "./ws/clientHub";
import { startRtpr } from "./services/rtpr";
import { startBenzinga } from "./services/benzinga";
import { startAlpacaWs } from "./services/alpaca";
import { startAlpacaNews } from "./services/alpacaNews";
import { startScanner, getScannerDefinitions, getCurrentAlerts, getScreenerRows } from "./services/scanner";
import { recentArticles, loadArticlesFromDb } from "./services/rtpr";
import { getSnapshots, getHourlyChanges } from "./services/alpaca";
import prisma from "./db/client";
import authRouter from "./routes/auth";
import watchlistsRouter from "./routes/watchlists";
import layoutsRouter from "./routes/layouts";
import tradesRouter from "./routes/trades";
import analyticsRouter from "./routes/analytics";
import botRouter from "./routes/bot";
import labelsRouter from "./routes/labels";
import { requireAuth } from "./middleware/auth";
import { requestId } from "./middleware/security";
import { initBot } from "./services/botController";
import { loadStrategiesFromDb, recomputeStrategies } from "./services/strategyEngine";
import { startTradingWs } from "./services/tradingWs";
import { startPositionMonitor } from "./services/positionMonitor";
import { scheduleRecapCron } from "./services/eodRecap";

const app = express();

// ── Security middleware ──────────────────────────────────────────────────
// Request ID for audit traceability
app.use(requestId);

// Helmet: security headers (CSP, X-Frame-Options, HSTS, etc.)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://s3.tradingview.com"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "https:"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // needed for TradingView widget
    hsts: { maxAge: 31536000, includeSubDomains: true },
  })
);

// CORS: explicit origin whitelist instead of wildcard
// In production with a reverse proxy, same-origin requests have no Origin header
// so we allow those. Cross-origin requests are checked against the whitelist.
app.use(
  cors({
    origin: (origin, callback) => {
      // No origin = same-origin request (via reverse proxy), curl, or server-to-server
      if (!origin) return callback(null, true);
      // Check against whitelist
      if (config.corsOrigins.length === 0 || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Reject but don't throw — return false so cors middleware sends proper headers
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    maxAge: 3600,
  })
);

// Global rate limiting: 100 requests per minute per IP
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, slow down" },
  })
);

// JSON body parser with size limit to prevent oversized payloads
app.use(express.json({ limit: "1mb" }));

// ── Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/watchlists", watchlistsRouter);
app.use("/api/layouts", layoutsRouter);
app.use("/api/trades", tradesRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/bot", botRouter);
app.use("/api/labels", labelsRouter);

// Scanner definitions (no auth needed — public metadata)
app.get("/api/scanners", (_req, res) => {
  res.json(getScannerDefinitions());
});

// Current scanner alert state (for hydrating clients on connect)
app.get("/api/scanner-alerts", requireAuth, (_req, res) => {
  res.json(getCurrentAlerts());
});

// Screener universe — full most-actives list enriched with float data
app.get("/api/screener", requireAuth, (_req, res) => {
  res.json({ rows: getScreenerRows() });
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
  const sym = req.params.symbol.toUpperCase().trim();
  // Validate ticker symbol format
  if (!/^[A-Z0-9.]{1,10}$/.test(sym)) {
    res.status(400).json({ error: "Invalid symbol" });
    return;
  }
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

  // Initialize bot controller (loads config, reconciles positions, hydrates positionMonitor)
  // Must run AFTER strategy cache is warm so win-rate checks have data
  await initBot();
  startTradingWs();        // connect to Alpaca trading stream
  startPositionMonitor();  // start 5s poll loop + EOD cron
  scheduleRecapCron();     // register 4:01 PM ET EOD recap cron

  // Recompute strategies every hour in case server has been up a long time
  setInterval(() => recomputeStrategies(), 60 * 60 * 1000);
});
