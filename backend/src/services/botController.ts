import prisma from '../db/client';
import { config } from '../config';
import { addPosition } from './positionMonitor';
import { restartTradingWs } from './tradingWs';
import { broadcast } from '../ws/clientHub';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BotState = 'stopped' | 'running' | 'paused';
export type BotMode = 'paper' | 'live';

export interface BotConfigRecord {
  id: string;
  enabled: boolean;
  state: string;
  mode: string;
  positionSizeUsd: number;
  confidenceMultiplierHigh: number;
  confidenceMultiplierMed: number;
  confidenceMultiplierLow: number;
  maxConcurrentPositions: number;
  dailyLossLimitUsd: number;
  minWinRate: number;
  hardStopLossPct: number;
  maxHoldDurationSec: number;
  enabledCatalystTiers: string; // comma-separated "1,2,3,4"
  maxFloatShares: number;
  maxSharePrice: number;
  minRelativeVolume: number;
  tradeSizeStars3: number;
  tradeSizeStars4: number;
  tradeSizeStars5: number;
  profitTargetPct: number;
  trailingStopPct: number;
  trailingStopDollar: number;
  updatedAt: Date;
}

// ─── Module-level singleton state (private) ────────────────────────────────────

let botState: BotState = 'stopped';
let botConfig: BotConfigRecord | null = null;

// ─── Private helpers ───────────────────────────────────────────────────────────

function getAlpacaHeaders() {
  return {
    'APCA-API-Key-ID': config.alpacaApiKey,
    'APCA-API-Secret-Key': config.alpacaApiSecret,
  };
}

function getTodayDateET(): string {
  // en-CA locale formats as YYYY-MM-DD natively
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

interface AlpacaPositionFull {
  symbol: string;
  avg_entry_price: string;
  qty: string;
}

async function reconcilePositions(): Promise<void> {
  try {
    const res = await fetch(`${getAlpacaBaseUrl()}/v2/positions`, {
      headers: getAlpacaHeaders(),
    });
    const livePositions: AlpacaPositionFull[] = res.ok
      ? (await res.json() as AlpacaPositionFull[])
      : [];

    // Build a map from symbol → live position for O(1) lookup
    const liveMap = new Map<string, AlpacaPositionFull>();
    for (const pos of livePositions) {
      liveMap.set(pos.symbol, pos);
    }

    const dbOpenTrades = await prisma.botTrade.findMany({
      where: { status: 'open' },
    });

    // Track which symbols are already in the DB to detect orphans
    const dbSymbols = new Set(dbOpenTrades.map((t) => t.symbol));

    let reconciled = 0;
    for (const trade of dbOpenTrades) {
      if (!liveMap.has(trade.symbol)) {
        // DB says open but Alpaca doesn't have it — mark as missed
        await prisma.botTrade.update({
          where: { id: trade.id },
          data: { status: 'missed', exitReason: 'reconciled_missing_on_startup' },
        });
        reconciled++;
      } else {
        // DB open + Alpaca open → warm the position monitor on startup
        addPosition({
          tradeId: trade.id,
          symbol: trade.symbol,
          entryPrice: trade.entryPrice ?? 0,
          entryAt: trade.entryAt ?? new Date(),
          peakPrice: trade.entryPrice ?? 0,
          shares: trade.shares ?? 0,
          catalystCategory: trade.catalystType ?? 'unknown',
        });
      }
    }

    // Import any orphan positions (Alpaca has them, DB does not)
    for (const [symbol, livePos] of liveMap) {
      if (!dbSymbols.has(symbol)) {
        console.warn(`[BotController] Orphan position imported: ${symbol} qty=${livePos.qty}`);
        const newTrade = await prisma.botTrade.create({
          data: {
            symbol: livePos.symbol,
            entryPrice: parseFloat(livePos.avg_entry_price),
            shares: parseFloat(livePos.qty),
            status: 'open',
            catalystType: 'unknown',
            catalystTier: null,
            alpacaOrderId: null,
            exitReason: null,
            entryAt: new Date(),
          },
        });
        addPosition({
          tradeId: newTrade.id,
          symbol: livePos.symbol,
          entryPrice: parseFloat(livePos.avg_entry_price),
          entryAt: new Date(),
          peakPrice: parseFloat(livePos.avg_entry_price),
          shares: parseFloat(livePos.qty),
          catalystCategory: 'unknown',
        });
      }
    }

    console.log(`[BotController] Reconciled ${dbOpenTrades.length} open positions, ${reconciled} marked missed`);
  } catch (err) {
    // Do NOT throw — server must start even if Alpaca is unreachable (outside market hours, bad key, etc.)
    console.warn('[BotController] reconcilePositions failed (non-fatal):', err);
  }
}

// ─── Exported: URL selector ────────────────────────────────────────────────────

/**
 * Returns the Alpaca base URL for the current bot mode.
 * Falls back to paper URL if botConfig is not yet loaded.
 */
export function getAlpacaBaseUrl(): string {
  if (!botConfig) return config.alpacaPaperUrl;
  return botConfig.mode === 'live' ? config.alpacaLiveUrl : config.alpacaPaperUrl;
}

// ─── Exported: Market hours ────────────────────────────────────────────────────

/**
 * Returns true if US equities market is currently open (9:30 AM – 4:00 PM ET, weekdays).
 * Does not account for market holidays.
 */
export function isMarketOpen(): boolean {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const totalMinutes = etTime.getHours() * 60 + etTime.getMinutes();
  return totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60;
}

// ─── Exported: Initialization ──────────────────────────────────────────────────

/**
 * Called once at server startup. Loads or creates the BotConfig singleton row,
 * restores the last known bot state, and reconciles open positions against the broker.
 */
export async function initBot(): Promise<void> {
  // Load or create the singleton BotConfig row
  botConfig = await prisma.botConfig.upsert({
    where: { id: 'singleton' },
    update: {}, // No update on first load — preserve existing values
    create: {
      id: 'singleton',
      enabled: false,
      state: 'stopped',
      mode: 'paper',
      positionSizeUsd: 500,
      confidenceMultiplierHigh: 2.0,
      confidenceMultiplierMed: 1.0,
      confidenceMultiplierLow: 0.5,
      maxConcurrentPositions: 3,
      dailyLossLimitUsd: 500,
      minWinRate: 0.5,
      hardStopLossPct: 7.0,
      maxHoldDurationSec: 300,
      enabledCatalystTiers: '1,2,3,4',
      maxFloatShares: 20000000,
      maxSharePrice: 20,
      minRelativeVolume: 5,
      tradeSizeStars3: 50,
      tradeSizeStars4: 75,
      tradeSizeStars5: 100,
      profitTargetPct: 10,
      trailingStopPct: 0,
      trailingStopDollar: 0,
    },
  });

  // Restore last known state from DB
  botState = botConfig.state as BotState;

  console.log(`[BotController] Initialized — state=${botState}, mode=${botConfig.mode}`);

  // Reconcile open positions against broker before accepting signals
  await reconcilePositions();
}

// ─── Exported: Synchronous accessors ──────────────────────────────────────────

/**
 * Returns the current bot state. Safe to call synchronously after initBot() has resolved.
 */
export function getBotState(): BotState {
  return botState;
}

/**
 * Returns the current BotConfig record. Non-null after initBot() is awaited at server startup.
 * Phase 2+ signal code reads config fields (minWinRate, enabledCatalystTiers, etc.) via this accessor.
 *
 * Note: enabledCatalystTiers is a comma-separated string — parse with .split(",").map(Number)
 */
export function getBotConfig(): BotConfigRecord {
  return botConfig!;
}

// ─── Exported: State mutation ──────────────────────────────────────────────────

/**
 * Updates bot state in memory and persists to DB.
 * Called by the state machine transitions (start, pause, resume, stop).
 */
export async function setBotState(newState: BotState): Promise<void> {
  botState = newState;
  await prisma.botConfig.update({
    where: { id: 'singleton' },
    data: { state: newState },
  });
  // Notify all subscribed frontend clients of the state change.
  // Sends a lightweight snapshot — full status (P&L, dayTradeCount) requires async DB
  // queries that setBotState cannot await. The frontend hydrates full status on mount.
  broadcast('bot', {
    type: 'bot_status_update',
    status: {
      state: newState,
      mode: botConfig?.mode ?? 'paper',
      openPositionCount: 0,  // frontend reconciles with GET /positions
      todayRealizedPnl: 0,
      todayTradeCount: 0,
      dayTradeCount: 0,
      marketOpen: isMarketOpen(),
    },
  });
}

// ─── Exported: Mode switching ──────────────────────────────────────────────────

/**
 * Switches bot between paper and live mode.
 * Rejects with an error if any BotTrade has status=open.
 * Guard is enforced at the service layer, not just the route layer (INFRA-08).
 */
export async function switchMode(newMode: BotMode): Promise<void> {
  const openCount = await prisma.botTrade.count({
    where: { status: 'open' },
  });
  if (openCount > 0) {
    throw new Error(`Cannot switch mode: ${openCount} position(s) currently open`);
  }
  botConfig = await prisma.botConfig.update({
    where: { id: 'singleton' },
    data: { mode: newMode },
  });
  // Reconnect trading WebSocket to the new mode's URL (paper ↔ live)
  restartTradingWs();
}

// ─── Exported: Config updates ──────────────────────────────────────────────────

/**
 * Applies a partial patch to BotConfig and persists to DB.
 * Used by Phase 5 UI configuration endpoints.
 */
export async function updateConfig(
  patch: Partial<Omit<BotConfigRecord, 'id' | 'updatedAt'>>
): Promise<BotConfigRecord> {
  botConfig = await prisma.botConfig.update({
    where: { id: 'singleton' },
    data: patch,
  });
  return botConfig;
}

// ─── Exported: State persistence ──────────────────────────────────────────────

/**
 * Explicit state persistence — call after any in-memory state changes
 * that haven't already triggered a DB write.
 */
export async function persistState(): Promise<void> {
  await prisma.botConfig.update({
    where: { id: 'singleton' },
    data: { state: botState },
  });
}

// ─── Internal utility (exported for tests) ────────────────────────────────────

/**
 * Returns today's date in YYYY-MM-DD format using ET timezone.
 * Used for BotDailyStats upserts.
 */
export { getTodayDateET };
