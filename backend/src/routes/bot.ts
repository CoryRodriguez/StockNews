import { Router } from 'express';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import {
  getBotState,
  setBotState,
  getBotConfig,
  isMarketOpen,
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
      marketOpen: isMarketOpen(),
    });
  } catch (err) {
    console.error('[BotRoute] /status error:', err);
    res.status(500).json({ error: 'Failed to load bot status' });
  }
});

export default router;
