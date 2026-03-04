import { Router } from 'express';
import prisma from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logSecurityEvent } from '../middleware/security';
import {
  getBotState,
  setBotState,
  getBotConfig,
  isMarketOpen,
  updateConfig,
  switchMode,
  getTodayDateET,
  type BotState,
} from '../services/botController';
import { evaluateGoLiveGate } from '../services/goLiveGate';
import { computeRecap } from '../services/eodRecap';

const router = Router();

// ── Input validation helpers ─────────────────────────────────────────────
const VALID_OUTCOMES = ["fired", "rejected", "skipped"] as const;
const VALID_RECAP_MODES = ["week", "month"] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─── POST /start ────────────────────────────────────────────────────────────
// Valid from: stopped only
router.post('/start', requireAuth, async (req: AuthRequest, res) => {
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
    logSecurityEvent(req, "BOT_STATE_CHANGED", { from: state, to: "running" });
    res.json({ state: 'running' });
  } catch (err) {
    console.error('[BotRoute] /start error:', err);
    res.status(500).json({ error: 'Failed to start bot' });
  }
});

// ─── POST /pause ─────────────────────────────────────────────────────────────
// Valid from: running only
// Semantics: no new buy signals, but open positions continue to be monitored
router.post('/pause', requireAuth, async (req: AuthRequest, res) => {
  try {
    const state: BotState = getBotState();
    if (state !== 'running') {
      res.status(400).json({ error: 'Bot must be running to pause' });
      return;
    }
    await setBotState('paused');
    logSecurityEvent(req, "BOT_STATE_CHANGED", { from: "running", to: "paused" });
    res.json({ state: 'paused' });
  } catch (err) {
    console.error('[BotRoute] /pause error:', err);
    res.status(500).json({ error: 'Failed to pause bot' });
  }
});

// ─── POST /resume ────────────────────────────────────────────────────────────
// Valid from: paused only
router.post('/resume', requireAuth, async (req: AuthRequest, res) => {
  try {
    const state: BotState = getBotState();
    if (state !== 'paused') {
      res.status(400).json({ error: 'Bot must be paused to resume' });
      return;
    }
    await setBotState('running');
    logSecurityEvent(req, "BOT_STATE_CHANGED", { from: "paused", to: "running" });
    res.json({ state: 'running' });
  } catch (err) {
    console.error('[BotRoute] /resume error:', err);
    res.status(500).json({ error: 'Failed to resume bot' });
  }
});

// ─── POST /stop ───────────────────────────────────────────────────────────────
// Valid from: running or paused
router.post('/stop', requireAuth, async (req: AuthRequest, res) => {
  try {
    const state: BotState = getBotState();
    if (state === 'stopped') {
      res.status(400).json({ error: 'Bot is already stopped' });
      return;
    }
    await setBotState('stopped');
    logSecurityEvent(req, "BOT_STATE_CHANGED", { from: state, to: "stopped" });
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
router.patch('/config', requireAuth, async (req: AuthRequest, res) => {
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
    logSecurityEvent(req, "CONFIG_CHANGED", { fields: Object.keys(patch) });
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
// Returns last 200 BotSignalLog rows (all outcomes) with full fields + left-joined HeadlineLabel
// Optional filter: ?outcome=fired|rejected|skipped
router.get('/signals', requireAuth, async (req, res) => {
  try {
    const outcomeRaw = req.query.outcome as string | undefined;
    // Validate outcome filter against whitelist
    const outcomeFilter = outcomeRaw && VALID_OUTCOMES.includes(outcomeRaw as any)
      ? outcomeRaw
      : undefined;
    const where = outcomeFilter ? { outcome: outcomeFilter } : {};

    const signals = await prisma.botSignalLog.findMany({
      where,
      orderBy: { evaluatedAt: 'desc' },
      take: 200,
    });

    // Batch-fetch labels for returned signal IDs
    const signalIds = signals.map((s) => s.id);
    const labels = await prisma.headlineLabel.findMany({
      where: { signalId: { in: signalIds } },
    });
    const labelMap = new Map(labels.map((l) => [l.signalId, l]));

    const result = signals.map((s) => ({
      ...s,
      label: labelMap.get(s.id) ?? null,
    }));

    res.json(result);
  } catch (err) {
    console.error('[BotRoute] /signals error:', err);
    res.status(500).json({ error: 'Failed to load bot signals' });
  }
});

// ─── POST /mode ───────────────────────────────────────────────────────────────
// Switches bot between paper and live mode.
// paper→live requires go-live gate to be satisfied (LIVE-03).
// Gate check is server-side — never trust client's gate assertion.
// live→paper does NOT require gate re-check.
// Both directions require no open positions (enforced by switchMode() service layer).
router.post('/mode', requireAuth, async (req: AuthRequest, res) => {
  const { mode } = req.body as { mode: string };
  if (mode !== 'paper' && mode !== 'live') {
    res.status(400).json({ error: 'mode must be "paper" or "live"' });
    return;
  }
  // Gate check is only required when switching TO live
  if (mode === 'live') {
    try {
      const gate = await evaluateGoLiveGate();
      if (!gate.passed) {
        res.status(403).json({
          error: gate.blockingReason ?? 'Go-live gate not satisfied',
          gate,
        });
        return;
      }
    } catch (err) {
      console.error('[BotRoute] /mode gate evaluation error:', err);
      res.status(500).json({ error: 'Failed to evaluate go-live gate' });
      return;
    }
  }
  try {
    await switchMode(mode as 'paper' | 'live');
    logSecurityEvent(req, "MODE_SWITCHED", { mode });
    // Frontend re-fetches GET /status after a successful switch to update the mode badge
    res.json({ mode });
  } catch (err) {
    // switchMode throws if positions are open — surface as 400
    const message = err instanceof Error ? err.message : 'Mode switch failed';
    res.status(400).json({ error: message });
  }
});

// ─── GET /gate ─────────────────────────────────────────────────────────────────
// Returns the current go-live gate status for the UI to display.
// Used by BotPanel to show gate progress before the user attempts to switch to live.
router.get('/gate', requireAuth, async (_req, res) => {
  try {
    const gate = await evaluateGoLiveGate();
    res.json(gate);
  } catch (err) {
    console.error('[BotRoute] /gate error:', err);
    res.status(500).json({ error: 'Failed to evaluate go-live gate' });
  }
});

// ─── GET /ai-keywords ────────────────────────────────────────────────────────
router.get('/ai-keywords', requireAuth, (_req, res) => {
  try {
    const cfg = getBotConfig();
    let keywords: string[] = [];
    try { keywords = JSON.parse(cfg.aiKeywords); } catch { /* empty */ }
    if (!Array.isArray(keywords)) keywords = [];
    res.json({ keywords });
  } catch (err) {
    console.error('[BotRoute] /ai-keywords GET error:', err);
    res.status(500).json({ error: 'Failed to load AI keywords' });
  }
});

// ─── PUT /ai-keywords ────────────────────────────────────────────────────────
router.put('/ai-keywords', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { keywords } = req.body as { keywords: unknown };
    if (!Array.isArray(keywords)) {
      res.status(400).json({ error: 'keywords must be an array' });
      return;
    }
    // Deduplicate, trim, filter empty strings
    const clean = [...new Set(
      keywords
        .filter((k: unknown) => typeof k === 'string')
        .map((k: string) => k.trim())
        .filter((k: string) => k.length > 0)
    )];
    await updateConfig({ aiKeywords: JSON.stringify(clean) });
    res.json({ keywords: clean });
  } catch (err) {
    console.error('[BotRoute] /ai-keywords PUT error:', err);
    res.status(500).json({ error: 'Failed to update AI keywords' });
  }
});

// ─── Recap date helpers ───────────────────────────────────────────────────────

function getWeekDates(anchor: string): string[] {
  const d = new Date(`${anchor}T12:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7)); // go back to Monday
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const cur = new Date(monday);
    cur.setUTCDate(monday.getUTCDate() + i);
    dates.push(cur.toISOString().slice(0, 10));
  }
  return dates;
}

function getMonthDates(anchor: string): string[] {
  const [year, month] = anchor.split('-').map(Number);
  const dates: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    // Only include weekdays (Mon-Fri)
    const dayOfWeek = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) dates.push(dateStr);
  }
  return dates;
}

// ─── GET /recap/history — MUST be registered before /recap ───────────────────
// Returns an array of DailyRecap rows for the specified week or month.
// GET /api/bot/recap/history?mode=week|month&anchor=YYYY-MM-DD
router.get('/recap/history', requireAuth, async (req, res) => {
  try {
    const modeRaw = (req.query.mode as string) ?? 'week';
    const mode = VALID_RECAP_MODES.includes(modeRaw as any) ? modeRaw : 'week';
    const anchorRaw = (req.query.anchor as string) ?? getTodayDateET();
    // Validate date format to prevent injection
    const anchor = DATE_PATTERN.test(anchorRaw) ? anchorRaw : getTodayDateET();
    const dates = mode === 'month' ? getMonthDates(anchor) : getWeekDates(anchor);
    const rows = await prisma.dailyRecap.findMany({
      where: { date: { in: dates } },
      orderBy: { date: 'asc' },
    });
    res.json(rows);
  } catch (err) {
    console.error('[BotRoute] /recap/history error:', err);
    res.status(500).json({ error: 'Failed to load recap history' });
  }
});

// ─── GET /recap ───────────────────────────────────────────────────────────────
// Returns full recap for a single day. Tries persisted first (fast); falls back
// to on-demand computation if not yet persisted.
// GET /api/bot/recap?date=YYYY-MM-DD
router.get('/recap', requireAuth, async (req, res) => {
  try {
    const dateRaw = (req.query.date as string) ?? getTodayDateET();
    const dateET = DATE_PATTERN.test(dateRaw) ? dateRaw : getTodayDateET();

    // Try persisted first (fast path)
    const persisted = await prisma.dailyRecap.findUnique({ where: { date: dateET } });
    if (persisted) { res.json(persisted); return; }

    // Fall back to on-demand computation (slower path)
    const data = await computeRecap(dateET);
    res.json(data);
  } catch (err) {
    console.error('[BotRoute] /recap error:', err);
    res.status(500).json({ error: 'Failed to load recap' });
  }
});

export default router;
