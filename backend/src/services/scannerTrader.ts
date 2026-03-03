/**
 * Scanner Trader Service
 *
 * Evaluates screener rows from the scanner's 30-second poll cycle against
 * configurable technical criteria (RVOL, float, gap%). Shares the bot's
 * position limits and exit rules via BotConfig singleton.
 *
 * Hook: called by scanner.ts at the end of runScan() with the full
 * screenerRows array. Fire-and-forget — never blocks the scanner loop.
 */
import prisma from '../db/client';
import { getBotState, getBotConfig, isMarketOpen, isRegularHours } from './botController';
import { getOpenPositionCount, getOpenSymbols } from './positionMonitor';
import { executeScannerTradeAsync } from './tradeExecutor';
import { broadcast } from '../ws/clientHub';
import type { ScreenerRow } from './scanner';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true during premarket hours (4:00 AM – 9:30 AM ET, weekdays) */
function isPremarket(): boolean {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay();
  if (day === 0 || day === 6) return false;
  const totalMinutes = etTime.getHours() * 60 + etTime.getMinutes();
  return totalMinutes >= 240 && totalMinutes < 570; // 4:00 AM to 9:30 AM
}

// ── Cooldown map: ticker → timestamp of last trade ──────────────────────────

const cooldownMap = new Map<string, number>();

// Cleanup expired cooldown entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ticker, ts] of cooldownMap) {
    if (now - ts > 60 * 60 * 1000) { // remove after 1 hour regardless
      cooldownMap.delete(ticker);
    }
  }
}, 10 * 60 * 1000);

// ── Main evaluation function ────────────────────────────────────────────────

/**
 * Evaluates all screener rows against scanner trading criteria.
 * Called after each 30-second scan cycle by scanner.ts.
 */
export async function evaluateScannerRows(rows: ScreenerRow[]): Promise<void> {
  // Gate 1: Bot must be running
  if (getBotState() !== 'running') return;

  // Gate 2: Market must be open
  if (!isMarketOpen()) return;

  const cfg = getBotConfig();

  // Gate 3: Scanner trading must be enabled
  if (!cfg.scannerTradingEnabled) return;

  // Gate 4: Must have position slots available
  const openCount = getOpenPositionCount();
  let slotsAvailable = cfg.maxConcurrentPositions - openCount;
  if (slotsAvailable <= 0) return;

  const heldSymbols = getOpenSymbols();
  const now = Date.now();
  const cooldownMs = cfg.scannerCooldownMin * 60 * 1000;

  for (const row of rows) {
    if (slotsAvailable <= 0) break;

    // Skip if already holding this symbol
    if (heldSymbols.has(row.ticker)) continue;

    // Skip if cooldown active for this ticker
    const lastTradeTime = cooldownMap.get(row.ticker);
    if (lastTradeTime && now - lastTradeTime < cooldownMs) continue;

    // Check technical criteria
    if (row.relativeVolume < cfg.scannerMinRvol) continue;
    if (row.float == null || row.float > cfg.scannerMaxFloat) continue;
    // Gap% filter only applies during premarket (4:00–9:30 AM ET)
    if (isPremarket() && row.gapPct < cfg.scannerMinGapPct) continue;
    if (row.price > cfg.maxSharePrice) continue;

    // All criteria passed — log and fire trade
    cooldownMap.set(row.ticker, now);
    heldSymbols.add(row.ticker); // prevent duplicate fires within same scan cycle
    slotsAvailable--;

    // Log to BotSignalLog
    await prisma.botSignalLog.create({
      data: {
        symbol: row.ticker,
        source: 'scanner',
        headline: `Scanner: RVOL ${row.relativeVolume.toFixed(1)}x | Float ${formatFloat(row.float)} | Gap ${row.gapPct.toFixed(1)}%`,
        catalystCategory: 'SCANNER',
        catalystTier: null,
        outcome: 'fired',
        rejectReason: null,
        priceAtEval: row.price,
        relVolAtEval: row.relativeVolume,
      },
    }).catch(err => console.error('[ScannerTrader] Signal log error:', err));

    // Broadcast to frontend
    broadcast('bot', {
      type: 'bot_signal_evaluated',
      signal: {
        symbol: row.ticker,
        catalystCategory: 'SCANNER',
        catalystTier: null,
        rejectReason: null,
        headline: `Scanner: RVOL ${row.relativeVolume.toFixed(1)}x | Float ${formatFloat(row.float)} | Gap ${row.gapPct.toFixed(1)}%`,
        source: 'scanner',
        evaluatedAt: new Date().toISOString(),
      },
    });

    // Fire trade (fire-and-forget)
    void executeScannerTradeAsync({
      symbol: row.ticker,
      priceAtSignal: row.price,
      gapPct: row.gapPct,
      relativeVolume: row.relativeVolume,
      float: row.float,
    }).catch(err => console.error(`[ScannerTrader] Trade execution error for ${row.ticker}:`, err));

    console.log(`[ScannerTrader] Fired: ${row.ticker} price=$${row.price} rvol=${row.relativeVolume.toFixed(1)}x float=${formatFloat(row.float)} gap=${row.gapPct.toFixed(1)}%`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFloat(shares: number): string {
  if (shares >= 1_000_000) return `${(shares / 1_000_000).toFixed(1)}M`;
  if (shares >= 1_000) return `${(shares / 1_000).toFixed(0)}K`;
  return String(shares);
}
