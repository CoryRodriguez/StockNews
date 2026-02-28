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
  // EXIT-02: Trailing stop — DEFERRED TO PHASE 4 per user decision
  // peakPrice is tracked above as groundwork only — no exit logic here
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

    // Update BotTrade in DB
    await prisma.botTrade.update({
      where: { id: pos.tradeId },
      data: {
        status: 'closed',
        exitReason: reason,
        exitPrice: exitPrice ?? undefined,
        exitAt: new Date(),
        pnl: pnl ?? undefined,
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initializes the position monitor: schedules the EOD force-close cron.
 * The 5-second poll loop is always active once this module is imported.
 * Called once from botController.ts / server startup (Plan 03-04).
 */
export function startPositionMonitor(): void {
  scheduleEodForceClose();
  console.log('[PositionMonitor] Started — polling every 5s, EOD close at 3:45 PM ET');
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
// Added in Plan 04-02 alongside signalEngine.ts changes. Plan 04-03 may also
// export these — these stubs ensure tsc passes regardless of wave completion order.

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
