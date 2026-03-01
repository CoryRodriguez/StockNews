/**
 * Position Monitor Service
 *
 * Watches all open bot positions every 5 seconds and fires exit conditions:
 *   EXIT-01: Hard stop loss (hardStopLossPct from BotConfig)
 *   EXIT-02: Trailing stop (configurable via BotConfig.trailingStopPct / trailingStopDollar)
 *   EXIT-03: Profit target (profitTargetPct from BotConfig)
 *   EXIT-04: Max hold time (maxHoldDurationSec from BotConfig)
 *   EXIT-05: EOD force-close at 3:45 PM ET (node-cron, Mon-Fri)
 *   EXIT-06: 5-second polling loop using batch getSnapshots()
 *
 * Leaf service — does NOT import tradeExecutor.ts or tradingWs.ts.
 * startPositionMonitor() is called once from server startup (wired in Plan 03-04).
 */
import cron from 'node-cron';
import prisma from '../db/client';
import { config } from '../config';
import { getSnapshots } from './alpaca';
import { getBotConfig, getAlpacaBaseUrl } from './botController';
import { broadcast } from '../ws/clientHub';

// ── In-memory position map ────────────────────────────────────────────────────

interface TrackedPosition {
  tradeId: string;      // BotTrade.id — primary key for DB updates
  symbol: string;
  entryPrice: number;
  entryAt: Date;
  peakPrice: number;    // tracked for EXIT-02 trailing stop — updated on every poll cycle
  shares: number;       // authoritative qty — updated after partial_fill
  catalystCategory: string;
  sold: boolean;        // race condition guard — set true BEFORE any sell
}

const openPositions = new Map<string, TrackedPosition>(); // key = tradeId

let cronsScheduled = false; // guard against duplicate cron registration on multiple startPositionMonitor() calls

// ── Exit condition check ──────────────────────────────────────────────────────

async function checkExitConditions(pos: TrackedPosition, currentPrice: number): Promise<void> {
  if (pos.sold) return;

  // Update peak price — used by EXIT-02 trailing stop below
  if (currentPrice > pos.peakPrice) pos.peakPrice = currentPrice;

  const cfg = getBotConfig();
  const pctChange = (currentPrice - pos.entryPrice) / pos.entryPrice * 100;
  const holdMinutes = (Date.now() - pos.entryAt.getTime()) / 60000;
  const maxHoldMinutes = cfg.maxHoldDurationSec / 60;

  // EXIT-01: Hard stop loss (stopLossPct is a positive number, e.g. 7 means -7%)
  if (pctChange <= -cfg.hardStopLossPct) {
    await closePosition(pos, currentPrice, 'hard_stop');
    return;
  }
  // EXIT-02: Trailing stop — fires when price falls below peak by configured amount
  // Hard stop (EXIT-01) runs first — provides absolute floor for fast crashes.
  // Trailing stop is secondary protection that locks in gains as price rises.
  // pct takes precedence over dollar when both are configured > 0 (CONTEXT.md Claude's Discretion).
  // Note: after server restart, peakPrice is reset to entryPrice (known limitation — hard stop still protects).
  const trailPct    = cfg.trailingStopPct;    // 0 = disabled
  const trailDollar = cfg.trailingStopDollar; // 0 = disabled

  if (trailPct > 0) {
    // Percentage trailing stop takes precedence
    const stopPrice = pos.peakPrice * (1 - trailPct / 100);
    if (currentPrice <= stopPrice) {
      await closePosition(pos, currentPrice, 'trailing_stop');
      return;
    }
  } else if (trailDollar > 0) {
    // Dollar trailing stop — only when pct is not configured (= 0)
    const stopPrice = pos.peakPrice - trailDollar;
    if (currentPrice <= stopPrice) {
      await closePosition(pos, currentPrice, 'trailing_stop');
      return;
    }
  }
  // EXIT-03: Profit target
  if (pctChange >= cfg.profitTargetPct) {
    await closePosition(pos, currentPrice, 'profit_target');
    return;
  }
  // EXIT-04: Max hold time
  if (holdMinutes >= maxHoldMinutes) {
    await closePosition(pos, currentPrice, 'time_exit');
    return;
  }
}

// ── Close position — sell logic with sold guard ───────────────────────────────

async function closePosition(pos: TrackedPosition, exitPrice: number | null, reason: string): Promise<void> {
  if (pos.sold) return;
  pos.sold = true;                           // set BEFORE any async operation
  openPositions.delete(pos.tradeId);         // remove from map immediately

  try {
    if (pos.shares > 0 && exitPrice !== null) {
      // Place market sell (use qty, not notional — selling shares we hold)
      const res = await fetch(`${getAlpacaBaseUrl()}/v2/orders`, {
        method: 'POST',
        headers: {
          'APCA-API-Key-ID': config.alpacaApiKey,
          'APCA-API-Secret-Key': config.alpacaApiSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: pos.symbol,
          qty: String(pos.shares),
          side: 'sell',
          type: 'market',
          time_in_force: 'day',
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[PositionMonitor] SELL failed for ${pos.symbol} (${res.status}): ${text}`);
        // Do NOT re-add to openPositions — the sold flag prevents re-entry
      } else {
        const order = await res.json() as { id: string };
        console.log(`[PositionMonitor] SELL placed (${reason}): ${pos.symbol} qty=${pos.shares} order=${order.id}`);
      }
    }

    // Calculate P&L
    const pnl = exitPrice != null ? (exitPrice - pos.entryPrice) * pos.shares : null;

    const exitAt = new Date();

    // Update BotTrade in DB
    await prisma.botTrade.update({
      where: { id: pos.tradeId },
      data: {
        status: 'closed',
        exitReason: reason,
        exitPrice: exitPrice ?? undefined,
        exitAt,
        pnl: pnl ?? undefined,
      },
    });

    // Notify subscribed frontend clients that a position was closed
    broadcast('bot', {
      type: 'bot_trade_closed',
      trade: {
        id: pos.tradeId,
        symbol: pos.symbol,
        entryPrice: pos.entryPrice,
        exitPrice,
        shares: pos.shares,
        pnl,
        catalystType: pos.catalystCategory,
        exitReason: reason,
        entryAt: pos.entryAt.toISOString(),
        exitAt: exitAt.toISOString(),
      },
    });

    console.log(`[PositionMonitor] Position closed (${reason}): ${pos.symbol} pnl=${pnl?.toFixed(2) ?? 'N/A'}`);
  } catch (err) {
    // Never crash the monitor loop on sell failure
    console.error(`[PositionMonitor] closePosition error for ${pos.symbol}:`, err instanceof Error ? err.message : err);
  }
}

// ── 5-second polling loop (EXIT-06) ──────────────────────────────────────────

const POLL_INTERVAL_MS = 5000;

setInterval(async () => {
  if (openPositions.size === 0) return;
  try {
    const symbols = [...new Set([...openPositions.values()].map(p => p.symbol))];
    const snapshots = await getSnapshots(symbols);
    for (const snap of snapshots) {
      const positionsForSymbol = [...openPositions.values()].filter(p => p.symbol === snap.ticker);
      for (const pos of positionsForSymbol) {
        await checkExitConditions(pos, snap.price);
      }
    }
  } catch (err) {
    console.error('[PositionMonitor] Poll error:', err instanceof Error ? err.message : err);
  }
}, POLL_INTERVAL_MS);

// ── EOD force-close cron (EXIT-05) ───────────────────────────────────────────

function scheduleEodForceClose(): void {
  cron.schedule('45 15 * * 1-5', async () => {
    console.log('[PositionMonitor] EOD force-close at 3:45 PM ET');
    const openTrades = [...openPositions.values()];
    for (const pos of openTrades) {
      // Get current price for P&L calculation
      const snaps = await getSnapshots([pos.symbol]).catch(() => []);
      const currentPrice = snaps[0]?.price ?? null;
      await closePosition(pos, currentPrice, 'force_close_eod');
    }
  }, { timezone: 'America/New_York' });
  console.log('[PositionMonitor] EOD force-close cron scheduled (3:45 PM ET, Mon-Fri)');
}

// ── 4AM daily reset cron (RISK-04) ───────────────────────────────────────────

function scheduleDailyReset(): void {
  cron.schedule('0 4 * * 1-5', async () => {
    console.log('[PositionMonitor] 4AM daily reset — clearing in-memory daily state');
    // No circuit breaker to clear (RISK-01 removed per user decision).
    // BotDailyStats rows are date-keyed: a new upsert on the first trade of the day
    // creates a fresh row automatically — no explicit zeroing needed here.
    // This cron exists to: (1) log the day boundary for debugging, (2) clear any
    // future in-memory counters without requiring a server restart.
    console.log('[PositionMonitor] Daily reset complete');
  }, { timezone: 'America/New_York' });
  console.log('[PositionMonitor] Daily reset cron scheduled (4:00 AM ET, Mon-Fri)');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initializes the position monitor: schedules the EOD force-close cron and 4AM daily reset cron.
 * The 5-second poll loop is always active once this module is imported.
 * Called once from botController.ts / server startup (Plan 03-04).
 */
export function startPositionMonitor(): void {
  if (cronsScheduled) return; // guard: prevent duplicate cron registration
  cronsScheduled = true;
  scheduleEodForceClose();
  scheduleDailyReset();
  console.log('[PositionMonitor] Started — polling every 5s, EOD close at 3:45 PM ET, daily reset at 4:00 AM ET');
}

/**
 * Adds a position to the in-memory map for monitoring.
 * Called by botController.ts reconcilePositions() to hydrate state on startup,
 * and by tradeExecutor.ts after a confirmed fill.
 */
export function addPosition(pos: Omit<TrackedPosition, 'sold'>): void {
  openPositions.set(pos.tradeId, { ...pos, sold: false });
  console.log(`[PositionMonitor] Tracking position: ${pos.symbol} tradeId=${pos.tradeId}`);
}

/**
 * Removes a position from the in-memory map.
 * Called by tradeExecutor.ts after fill confirmation (Plan 03-04 wires this).
 */
export function removePosition(tradeId: string): void {
  openPositions.delete(tradeId);
}

// ── Risk gate helpers (RISK-02 and RISK-05 — consumed by signalEngine.ts) ─────
// Exported for signalEngine.ts (Plan 04-02) to enforce max concurrent positions (RISK-02)
// and per-symbol concentration (RISK-05) without a circular dependency.

/**
 * Returns the number of currently open tracked positions.
 * Used by signalEngine.ts step 10.5 (RISK-02: max concurrent positions).
 */
export function getOpenPositionCount(): number {
  return openPositions.size;
}

/**
 * Returns a Set of ticker symbols currently held in open positions.
 * Used by signalEngine.ts step 10.6 (RISK-05: per-symbol concentration).
 */
export function getOpenSymbols(): Set<string> {
  return new Set([...openPositions.values()].map(p => p.symbol));
}
