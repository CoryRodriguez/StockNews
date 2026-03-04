import { Router } from "express";
import prisma from "../db/client";
import { requireAuth } from "../middleware/auth";
import { evaluateUserArticle } from "../services/aiStarRater";
import { analyzeTopMovers } from "../services/moverAnalysis";
import { broadcast } from "../ws/clientHub";

const router = Router();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TICKER_PATTERN = /^[A-Z0-9.]{1,10}$/;

// ── GET /keywords — keyword hit summary + recent ─────────────────────────

router.get("/keywords", requireAuth, async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? "7"), 10) || 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Summary: aggregate by catalystCategory
    const summary = await prisma.keywordHit.groupBy({
      by: ["catalystCategory"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      _avg: { aiStars: true, return1hPct: true, return4hPct: true, returnEodPct: true },
    });

    // Recent hits (last 100)
    const recent = await prisma.keywordHit.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json({ summary, recent });
  } catch (err) {
    console.error("[CatalystRoute] /keywords error:", err);
    res.status(500).json({ error: "Failed to fetch keyword data" });
  }
});

// ── GET /keywords/stats — stats by catalyst category ─────────────────────

router.get("/keywords/stats", requireAuth, async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const stats = await prisma.keywordHit.groupBy({
      by: ["catalystCategory"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      _avg: { aiStars: true, return1hPct: true, return4hPct: true, returnEodPct: true },
    });

    // Compute win rate per category (return1hPct > 0)
    const categories = stats.map((s) => s.catalystCategory).filter(Boolean);
    const winRates: Record<string, number> = {};

    for (const cat of categories) {
      if (!cat) continue;
      const total = await prisma.keywordHit.count({
        where: { catalystCategory: cat, createdAt: { gte: since }, return1hPct: { not: null } },
      });
      const wins = await prisma.keywordHit.count({
        where: { catalystCategory: cat, createdAt: { gte: since }, return1hPct: { gt: 0 } },
      });
      winRates[cat] = total > 0 ? Math.round((wins / total) * 100) : 0;
    }

    const result = stats.map((s) => ({
      catalystCategory: s.catalystCategory ?? "UNKNOWN",
      hitCount: s._count.id,
      avgStars: Math.round((s._avg.aiStars ?? 0) * 10) / 10,
      avgReturn1h: Math.round((s._avg.return1hPct ?? 0) * 100) / 100,
      avgReturn4h: Math.round((s._avg.return4hPct ?? 0) * 100) / 100,
      avgReturnEod: Math.round((s._avg.returnEodPct ?? 0) * 100) / 100,
      winRate: winRates[s.catalystCategory ?? ""] ?? 0,
    }));

    res.json(result);
  } catch (err) {
    console.error("[CatalystRoute] /keywords/stats error:", err);
    res.status(500).json({ error: "Failed to fetch keyword stats" });
  }
});

// ── POST /articles — submit user article ─────────────────────────────────

router.post("/articles", requireAuth, async (req, res) => {
  try {
    const { ticker, title, body, url, notes } = req.body;

    if (!ticker || !title || !body) {
      res.status(400).json({ error: "ticker, title, and body are required" });
      return;
    }

    const cleanTicker = String(ticker).toUpperCase().trim();
    if (!TICKER_PATTERN.test(cleanTicker)) {
      res.status(400).json({ error: "Invalid ticker format" });
      return;
    }

    const article = await prisma.userArticle.create({
      data: {
        ticker: cleanTicker,
        title: String(title).slice(0, 5000),
        body: String(body).slice(0, 10000),
        url: url ? String(url).slice(0, 2000) : null,
        notes: notes ? String(notes).slice(0, 2000) : null,
      },
    });

    // Fire-and-forget AI evaluation
    evaluateUserArticle(article.id, cleanTicker, article.title, article.body)
      .then((result) => {
        if (result) {
          // Broadcast updated article
          broadcast("catalyst", {
            type: "catalyst_user_article",
            article: {
              ...article,
              aiStars: result.stars,
              aiAnalysis: result.analysis,
              aiConfidence: result.confidence,
              createdAt: article.createdAt.toISOString(),
              updatedAt: article.updatedAt.toISOString(),
            },
          });
        }
      })
      .catch(() => {});

    res.json({
      ...article,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error("[CatalystRoute] POST /articles error:", err);
    res.status(500).json({ error: "Failed to create article" });
  }
});

// ── GET /articles — list user articles ───────────────────────────────────

router.get("/articles", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const articles = await prisma.userArticle.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json(articles);
  } catch (err) {
    console.error("[CatalystRoute] GET /articles error:", err);
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});

// ── DELETE /articles/:id — delete user article ───────────────────────────

router.delete("/articles/:id", requireAuth, async (req, res) => {
  try {
    await prisma.userArticle.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("[CatalystRoute] DELETE /articles error:", err);
    res.status(500).json({ error: "Failed to delete article" });
  }
});

// ── GET /movers — mover analysis for a date ──────────────────────────────

router.get("/movers", requireAuth, async (req, res) => {
  try {
    const date = String(req.query.date ?? "");
    if (!DATE_PATTERN.test(date)) {
      // Default to today ET
      const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
      const analysis = await prisma.dailyMoverAnalysis.findUnique({ where: { date: todayET } });
      res.json(analysis ?? null);
      return;
    }
    const analysis = await prisma.dailyMoverAnalysis.findUnique({ where: { date } });
    res.json(analysis ?? null);
  } catch (err) {
    console.error("[CatalystRoute] GET /movers error:", err);
    res.status(500).json({ error: "Failed to fetch mover analysis" });
  }
});

// ── GET /movers/history — list available analysis dates ──────────────────

router.get("/movers/history", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(90, Math.max(1, parseInt(String(req.query.limit ?? "30"), 10) || 30));
    const dates = await prisma.dailyMoverAnalysis.findMany({
      orderBy: { date: "desc" },
      take: limit,
      select: { date: true, computedAt: true },
    });
    res.json(dates);
  } catch (err) {
    console.error("[CatalystRoute] GET /movers/history error:", err);
    res.status(500).json({ error: "Failed to fetch mover history" });
  }
});

// ── POST /movers/compute — manually trigger analysis ─────────────────────

router.post("/movers/compute", requireAuth, async (_req, res) => {
  try {
    const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    // Fire-and-forget
    analyzeTopMovers(todayET).catch((err) =>
      console.error("[CatalystRoute] Manual compute error:", err)
    );
    res.json({ ok: true, date: todayET });
  } catch (err) {
    console.error("[CatalystRoute] POST /movers/compute error:", err);
    res.status(500).json({ error: "Failed to trigger analysis" });
  }
});

export default router;
