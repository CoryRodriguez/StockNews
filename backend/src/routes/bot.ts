import { Router } from 'express';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import {
  getBotState,
  setBotState,
  getBotConfig,
  isMarketOpen,
  updateConfig,
  type BotState,
} from '../services/botController';

const router = Router();

// ─── POST /start ────────────────────────────────────────────────────────────
// Valid from: stopped only
router.post('/start', requireAuth, async (_req, res) => {
  try {
    const state: BotState = getBotState();
    if (state === 'running') {
      res.status(400).json({ error: 'Bot is already running' });
      return;
    }
    if (state === 'paused') {
      res.status(400).json({ error: 'Bot is paused — use /resume to continue' });
      return;
    }
    await setBotState('running');
    res.json({ state: 'running' });
  } catch (err) {
    console.error('[BotRoute] /start error:', err);
    res.status(500).json({ error: 'Failed to start bot' });
  }
});

// ─── POST /pause ─────────────────────────────────────────────────────────────
// Valid from: running only
// Semantics: no new buy signals, but open positions continue to be monitored
router.post('/pause', requireAuth, async (_req, res) => {
  try {
    const state: BotState = getBotState();
    if (state !== 'running') {
      res.status(400).json({ error: 'Bot must be running to pause' });
      return;
    }
    await setBotState('paused');
    res.json({ state: 'paused' });
  } catch (err) {
    console.error('[BotRoute] /pause error:', err);
    res.status(500).json({ error: 'Failed to pause bot' });
  }
});

// ─── POST /resume ────────────────────────────────────────────────────────────
// Valid from: paused only
router.post('/resume', requireAuth, async (_req, res) => {
  try {
    const state: BotState = getBotState();
    if (state !== 'paused') {
      res.status(400).json({ error: 'Bot must be paused to resume' });
      return;
    }
    await setBotState('running');
    res.json({ state: 'running' });
  } catch (err) {
    console.error('[BotRoute] /resume error:', err);
    res.status(500).json({ error: 'Failed to resume bot' });
  }
});

// ─── POST /stop ───────────────────────────────────────────────────────────────
// Valid from: running or paused
router.post('/stop', requireAuth, async (_req, res) => {
  try {
    const state: BotState = getBotState();
    if (state === 'stopped') {
      res.status(400).json({ error: 'Bot is already stopped' });
      return;
    }
    await setBotState('stopped');
    res.json({ state: 'stopped' });
  } catch (err) {
    console.error('[BotRoute] /stop error:', err);
    res.status(500).json({ error: 'Failed to stop bot' });
  }
});

// ─── GET /status ─────────────────────────────────────────────────────────────
// Returns full bot snapshot: state, mode, open position count, today's P&L, trade count, market hours
router.get('/status', requireAuth, async (_req, res) => {
  try {
    const cfg = getBotConfig();
    const todayET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

    const [openPositionCount, dailyStats] = await Promise.all([
      prisma.botTrade.count({ where: { status: 'open' } }),
      prisma.botDailyStats.findFirst({ where: { date: todayET } }),
    ]);

    res.json({
      state: getBotState(),
      mode: cfg.mode,
      openPositionCount,
      todayRealizedPnl: dailyStats?.realizedPnl ?? 0,
      todayTradeCount: dailyStats?.tradeCount ?? 0,
      dayTradeCount: dailyStats?.dayTradeCount ?? 0,
      marketOpen: isMarketOpen(),
    });
  } catch (err) {
    console.error('[BotRoute] /status error:', err);
    res.status(500).json({ error: 'Failed to load bot status' });
  }
});

// ─── GET /config ──────────────────────────────────────────────────────────────
// Returns the current BotConfig singleton
router.get('/config', requireAuth, (_req, res) => {
  try {
    const cfg = getBotConfig();
    res.json(cfg);
  } catch (err) {
    console.error('[BotRoute] /config GET error:', err);
    res.status(500).json({ error: 'Failed to load bot config' });
  }
});

// ─── PATCH /config ────────────────────────────────────────────────────────────
// Applies a partial update to BotConfig — strips id and updatedAt before delegating to updateConfig()
router.patch('/config', requireAuth, async (req, res) => {
  try {
    const { id: _id, updatedAt: _ts, ...patch } = req.body as Record<string, unknown>;
    // Lightweight validation
    if (patch.positionSizeUsd !== undefined && (patch.positionSizeUsd as number) <= 0) {
      res.status(400).json({ error: 'positionSizeUsd must be > 0' });
      return;
    }
    if (patch.minWinRate !== undefined) {
      const wr = patch.minWinRate as number;
      if (wr < 0 || wr > 1) { res.status(400).json({ error: 'minWinRate must be 0–1' }); return; }
    }
    const updated = await updateConfig(patch as Parameters<typeof updateConfig>[0]);
    res.json(updated);
  } catch (err) {
    console.error('[BotRoute] /config PATCH error:', err);
    res.status(500).json({ error: 'Failed to update bot config' });
  }
});

// ─── GET /positions ───────────────────────────────────────────────────────────
// Returns all open BotTrade rows ordered by entry time (newest first)
router.get('/positions', requireAuth, async (_req, res) => {
  try {
    const positions = await prisma.botTrade.findMany({
      where: { status: 'open' },
      orderBy: { entryAt: 'desc' },
    });
    res.json(positions);
  } catch (err) {
    console.error('[BotRoute] /positions error:', err);
    res.status(500).json({ error: 'Failed to load positions' });
  }
});

// ─── GET /trades ──────────────────────────────────────────────────────────────
// Returns last 100 completed BotTrade rows (status != 'open'), newest exit first
router.get('/trades', requireAuth, async (_req, res) => {
  try {
    const trades = await prisma.botTrade.findMany({
      where: { status: { not: 'open' } },
      orderBy: { exitAt: 'desc' },
      take: 100,
    });
    res.json(trades);
  } catch (err) {
    console.error('[BotRoute] /trades error:', err);
    res.status(500).json({ error: 'Failed to load bot trades' });
  }
});

// ─── GET /signals ─────────────────────────────────────────────────────────────
// Returns last 100 rejected BotSignalLog rows with selected fields
router.get('/signals', requireAuth, async (_req, res) => {
  try {
    const signals = await prisma.botSignalLog.findMany({
      where: { outcome: 'rejected' },
      orderBy: { evaluatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        symbol: true,
        catalystCategory: true,
        catalystTier: true,
        rejectReason: true,
        evaluatedAt: true,
        headline: true,
        source: true,
      },
    });
    res.json(signals);
  } catch (err) {
    console.error('[BotRoute] /signals error:', err);
    res.status(500).json({ error: 'Failed to load bot signals' });
  }
});

export default router;
