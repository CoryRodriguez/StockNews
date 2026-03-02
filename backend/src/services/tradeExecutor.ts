/**
 * Trade Executor Service
 *
 * Handles the buy side of the autonomous trading pipeline:
 * - Star-rating sizing (tier/aiConfidence → notional dollar amount)
 * - Duplicate open position guard (silent skip, no DB write)
 * - Notional buy order via Alpaca REST API
 * - BotTrade lifecycle: creation, fill confirmation, rejection handling
 *
 * Fire-and-forget: callers use `void executeTradeAsync(signal).catch(console.error)`
 * Never blocks the news handler thread.
 *
 * The sell side (exit conditions) is in positionMonitor.ts (Plan 03-03).
 * Plan 03-04 wires this into the startup sequence.
 */

import prisma from '../db/client';
import { config } from '../config';
import { getAlpacaBaseUrl, getBotConfig, isRegularHours } from './botController';
import { getVwapDev } from './alpaca';
import { addPosition } from './positionMonitor';

// ─── Types ─────────────────────────────────────────────────────────────────────

type StarRating = 3 | 4 | 5;

export interface TradeSignal {
  symbol: string;
  catalystCategory: string;
  catalystTier: number;
  aiConfidence: 'high' | 'medium' | 'low' | null;
  priceAtSignal: number;
}

// Alpaca REST API response shapes
interface AlpacaOrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  time_in_force: 'day';
  notional?: number;
  qty?: string;
  limit_price?: string;
  extended_hours?: boolean;
}

interface AlpacaOrderResponse {
  id: string;
  status: string;
  symbol: string;
  notional: string | null;
  qty: string | null;
  filled_qty: string;
  filled_avg_price: string | null;
  side: string;
  created_at: string;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  unrealized_plpc: string;
}

// ─── Helpers: Star-rating sizing ───────────────────────────────────────────────

/**
 * Maps catalyst tier and AI confidence to a star rating (3 | 4 | 5 | null).
 * null means "skip" — signal is below minimum confidence threshold (1-2 stars).
 *
 * Rules per CONTEXT.md locked decisions:
 *   tier 1-2: always 5 stars (top confidence regardless of AI)
 *   tier 3-4: AI confidence maps to rating (high=5, med=4, low=3)
 *   tier 3-4 with null AI: skip (no DB write)
 */
function getStarRating(tier: number, aiConfidence: 'high' | 'medium' | 'low' | null): StarRating | null {
  if (tier <= 2) return 5; // tier 1-2: always top confidence
  if (aiConfidence === 'high') return 5;
  if (aiConfidence === 'medium') return 4;
  if (aiConfidence === 'low') return 3;
  return null; // null AI = skip (1-2 star per CONTEXT.md)
}

/**
 * Returns the notional dollar amount for the given star rating.
 * Always reads from getBotConfig() — never hardcoded.
 */
function getNotional(starRating: StarRating): number {
  const cfg = getBotConfig();
  if (starRating === 5) return cfg.tradeSizeStars5; // $100 default
  if (starRating === 4) return cfg.tradeSizeStars4; // $75 default
  return cfg.tradeSizeStars3;                       // $50 default
}

// ─── Helpers: Duplicate position guard ────────────────────────────────────────

/**
 * Returns true if there is already an open BotTrade for the given symbol.
 * A second signal for the same symbol is silently skipped (no DB write).
 */
async function hasOpenPosition(symbol: string): Promise<boolean> {
  const count = await prisma.botTrade.count({ where: { symbol, status: 'open' } });
  return count > 0;
}

// ─── Helpers: Alpaca REST headers ──────────────────────────────────────────────

function getAlpacaHeaders(): Record<string, string> {
  return {
    'APCA-API-Key-ID': config.alpacaApiKey,
    'APCA-API-Secret-Key': config.alpacaApiSecret,
    'Content-Type': 'application/json',
  };
}

// ─── Helpers: Alpaca order placement ──────────────────────────────────────────

/**
 * Places a buy order via Alpaca REST API.
 * - Regular hours: market order with notional (dollar amount)
 * - Extended hours (premarket/after-hours): limit order with qty and extended_hours flag
 *   (Alpaca requires limit orders for extended hours — no market/notional orders allowed)
 *
 * Returns the order response on success, null on failure.
 * On failure: logs error with status code and body — does NOT throw (EXEC-04).
 */
async function placeBuyOrder(
  symbol: string,
  notional: number,
  priceAtSignal: number
): Promise<AlpacaOrderResponse | null> {
  let body: AlpacaOrderRequest;

  if (isRegularHours()) {
    // Regular hours: market order with notional dollar amount
    body = {
      symbol,
      notional,
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
    };
  } else {
    // Extended hours: limit order with qty (Alpaca requires limit for extended hours)
    const qty = Math.floor(notional / priceAtSignal);
    if (qty < 1) {
      console.warn(`[TradeExecutor] Extended hours: notional=$${notional} / price=$${priceAtSignal} = 0 shares, skipping ${symbol}`);
      return null;
    }
    // Set limit price slightly above current price (0.5% buffer) to increase fill probability
    const limitPrice = (priceAtSignal * 1.005).toFixed(2);
    body = {
      symbol,
      qty: String(qty),
      side: 'buy',
      type: 'limit',
      time_in_force: 'day',
      limit_price: limitPrice,
      extended_hours: true,
    };
    console.log(`[TradeExecutor] Extended hours order: ${symbol} qty=${qty} limit=$${limitPrice}`);
  }

  try {
    const res = await fetch(`${getAlpacaBaseUrl()}/v2/orders`, {
      method: 'POST',
      headers: getAlpacaHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const bodyText = await res.text();
      console.error(`[TradeExecutor] Order placement failed: ${symbol} status=${res.status} body=${bodyText}`);
      return null;
    }

    return (await res.json()) as AlpacaOrderResponse;
  } catch (err) {
    console.error(`[TradeExecutor] Order placement error for ${symbol}:`, err);
    return null;
  }
}

// ─── Helpers: PDT guard (RISK-03 — live mode only) ────────────────────────────

/**
 * Checks Alpaca account daytrade_count. Returns true if the next trade would
 * push the account to 4+ day trades in the 5-day window (PDT violation).
 *
 * Paper mode: always returns false (account is >$25k, PDT rule doesn't apply).
 * Fail open: any API error or non-200 response returns false (allow trade).
 * This prevents blocking all trades during Alpaca maintenance windows.
 */
async function checkPdtLimit(): Promise<boolean> {
  const botCfg = getBotConfig();
  if (botCfg.mode !== 'live') return false; // PDT only applies to live accounts under $25k

  try {
    const res = await fetch(`${getAlpacaBaseUrl()}/v2/account`, {
      headers: getAlpacaHeaders(),
    });
    if (!res.ok) {
      console.warn(`[TradeExecutor] PDT check: account fetch failed (${res.status}) — allowing trade`);
      return false;
    }
    const account = await res.json() as { daytrade_count: number };
    // daytrade_count >= 3 means placing this trade would be the 4th in the 5-day window
    return account.daytrade_count >= 3;
  } catch (err) {
    console.warn('[TradeExecutor] PDT check error — allowing trade:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ─── Exported: Fill event handler (called by tradingWs.ts) ────────────────────

/**
 * Called by tradingWs.ts when a fill or partial_fill event arrives.
 *
 * fill:         Update BotTrade with entryPrice + shares from fill data.
 * partial_fill: Call GET /v2/positions/{symbol} for authoritative share count.
 *               Never trust WebSocket partial fill qty alone (EXEC-03).
 */
export async function onFillEvent(update: {
  event: 'fill' | 'partial_fill';
  orderId: string;
  filledQty: string;
  filledAvgPrice: string | null;
  symbol: string;
}): Promise<void> {
  const { event, orderId, filledQty, filledAvgPrice, symbol } = update;

  if (event === 'fill') {
    // Full fill — use fill event data directly
    const entryPrice = filledAvgPrice ? parseFloat(filledAvgPrice) : null;
    const shares = parseFloat(filledQty);

    await prisma.botTrade.updateMany({
      where: { alpacaOrderId: orderId },
      data: {
        entryPrice: entryPrice ?? undefined,
        shares,
      },
    });

    // Register with position monitor for exit condition tracking
    if (entryPrice !== null) {
      const trade = await prisma.botTrade.findFirst({
        where: { alpacaOrderId: orderId, status: 'open' },
      });
      if (trade) {
        addPosition({
          tradeId: trade.id,
          symbol: trade.symbol,
          entryPrice,
          entryAt: trade.entryAt ?? new Date(),
          peakPrice: entryPrice,
          minPrice: entryPrice,
          shares,
          catalystCategory: trade.catalystType ?? 'UNKNOWN',
        });
      }
    }

    console.log(`[TradeExecutor] Fill confirmed: ${symbol} orderId=${orderId} shares=${shares} avgPrice=${entryPrice}`);
  } else {
    // partial_fill — reconcile with GET /v2/positions/{symbol} for authoritative qty (EXEC-03)
    try {
      const res = await fetch(
        `${getAlpacaBaseUrl()}/v2/positions/${encodeURIComponent(symbol)}`,
        { headers: getAlpacaHeaders() }
      );

      if (res.ok) {
        const position = (await res.json()) as AlpacaPosition;
        const authoritativeShares = parseFloat(position.qty);

        await prisma.botTrade.updateMany({
          where: { alpacaOrderId: orderId },
          data: { shares: authoritativeShares },
        });

        console.log(`[TradeExecutor] Partial fill reconciled: ${symbol} orderId=${orderId} authoritativeShares=${authoritativeShares}`);
      } else {
        // Position lookup failed — fall back to WebSocket qty
        const shares = parseFloat(filledQty);
        await prisma.botTrade.updateMany({
          where: { alpacaOrderId: orderId },
          data: { shares },
        });
        console.warn(`[TradeExecutor] Partial fill position lookup failed (${res.status}) for ${symbol} — using WebSocket qty=${shares}`);
      }
    } catch (err) {
      console.error(`[TradeExecutor] Partial fill reconciliation error for ${symbol}:`, err);
    }
  }
}

// ─── Exported: Rejection event handler (called by tradingWs.ts) ───────────────

/**
 * Called by tradingWs.ts when a rejected event arrives.
 * Updates BotTrade to status='missed', exitReason='alpaca_rejected'. Does not throw.
 */
export async function onRejectedEvent(update: {
  orderId: string;
  symbol: string;
  reason?: string;
}): Promise<void> {
  const { orderId, symbol, reason } = update;

  await prisma.botTrade.updateMany({
    where: { alpacaOrderId: orderId },
    data: {
      status: 'missed',
      exitReason: 'alpaca_rejected',
    },
  });

  console.log(`[TradeExecutor] Order rejected: ${symbol} orderId=${orderId}${reason ? ` reason=${reason}` : ''}`);
}

// ─── Exported: Main entry point ────────────────────────────────────────────────

/**
 * Async trade execution function — called fire-and-forget by signalEngine.ts:
 *   void executeTradeAsync(signal).catch(err => console.error('[TradeExecutor]', err))
 *
 * Never awaited by the news handler. Never blocks the signal pipeline.
 *
 * Steps:
 *   1. Compute star rating → if null, return (silent skip)
 *   2. Check for existing open position → if true, return (silent skip, no DB write)
 *   3. Compute notional amount from star rating (from BotConfig, never hardcoded)
 *   4. Place notional buy order → if null (failed), return (error already logged)
 *   5. Create BotTrade record with status='open', alpacaOrderId, catalystType, catalystTier, entryAt
 *      entryPrice and shares start as null — filled in by onFillEvent()
 */
export async function executeTradeAsync(signal: TradeSignal): Promise<void> {
  const { symbol, catalystCategory, catalystTier, aiConfidence } = signal;

  // Step 1: Compute star rating — null means skip (below minimum confidence)
  const starRating = getStarRating(catalystTier, aiConfidence);
  if (starRating === null) {
    return; // silent skip — no DB write (CONTEXT.md: 1-2 star signals are filtered out)
  }

  // Step 2: Check for existing open position — skip if already tracking this symbol
  if (await hasOpenPosition(symbol)) {
    return; // silent skip — no DB write per CONTEXT.md
  }

  // Step 3: Compute notional dollar amount from BotConfig
  const notional = getNotional(starRating);

  // Step 3.5: PDT guard — live mode only (RISK-03)
  // Paper mode is >$25k intentionally — no PDT applies (per CONTEXT.md locked decision)
  if (await checkPdtLimit()) {
    console.warn(`[TradeExecutor] PDT limit reached for ${symbol} — blocked (live mode)`);
    await prisma.botTrade.create({
      data: {
        symbol,
        status: 'rejected',
        exitReason: 'pdt_limit',
        catalystType: catalystCategory,
        catalystTier,
        entryAt: new Date(),
      },
    });
    return;
  }

  // Step 4: Place buy order (market during regular hours, limit during extended hours)
  const order = await placeBuyOrder(symbol, notional, signal.priceAtSignal);
  if (order === null) {
    return; // error already logged in placeNotionalBuyOrder
  }

  // Step 5: Create BotTrade record — entryPrice and shares are null until fill event
  const trade = await prisma.botTrade.create({
    data: {
      symbol,
      status: 'open',
      alpacaOrderId: order.id,
      catalystType: catalystCategory,
      catalystTier,
      entryAt: new Date(),
      // entryPrice and shares filled by onFillEvent() via tradingWs.ts callbacks
    },
  });

  // Step 5.5: Capture VWAP deviation at entry (non-blocking — fire and forget)
  // priceAtSignal is the price from the snapshot captured in signalEngine.ts
  const priceAtSignal = signal.priceAtSignal;
  getVwapDev(symbol, priceAtSignal).then(vwapDev => {
    if (vwapDev != null) {
      prisma.botTrade.update({
        where: { id: trade.id },
        data: { entryVwapDev: vwapDev },
      }).catch(() => {}); // non-fatal — missing VWAP data does not affect trade lifecycle
    }
  }).catch(() => {}); // non-fatal — VWAP fetch failure should not affect trade lifecycle

  console.log(`[TradeExecutor] Order placed: ${symbol} notional=$${notional} stars=${starRating} orderId=${order.id}`);
}

// ─── Scanner trade types ──────────────────────────────────────────────────────

export interface ScannerTradeSignal {
  symbol: string;
  priceAtSignal: number;
  gapPct: number;
  relativeVolume: number;
  float: number | null;
}

// ─── Exported: Scanner trade entry point ──────────────────────────────────────

/**
 * Entry point for scanner-triggered trades. Similar to executeTradeAsync but:
 * - No star rating (uses flat scannerTradeSize from config)
 * - catalystType = 'SCANNER', catalystTier = null
 * - No article or AI evaluation required
 */
export async function executeScannerTradeAsync(signal: ScannerTradeSignal): Promise<void> {
  const { symbol, priceAtSignal } = signal;

  // Step 1: Duplicate position guard
  if (await hasOpenPosition(symbol)) return;

  // Step 2: PDT guard (live mode only)
  if (await checkPdtLimit()) {
    console.warn(`[TradeExecutor] PDT limit reached for scanner trade ${symbol}`);
    return;
  }

  // Step 3: Get notional from scanner-specific config
  const cfg = getBotConfig();
  const notional = cfg.scannerTradeSize;

  // Step 4: Place buy order
  const order = await placeBuyOrder(symbol, notional, priceAtSignal);
  if (order === null) return;

  // Step 5: Create BotTrade record
  const trade = await prisma.botTrade.create({
    data: {
      symbol,
      status: 'open',
      alpacaOrderId: order.id,
      catalystType: 'SCANNER',
      catalystTier: null,
      entryAt: new Date(),
    },
  });

  // Step 6: VWAP deviation (non-blocking)
  getVwapDev(symbol, priceAtSignal).then(vwapDev => {
    if (vwapDev != null) {
      prisma.botTrade.update({
        where: { id: trade.id },
        data: { entryVwapDev: vwapDev },
      }).catch(() => {});
    }
  }).catch(() => {});

  console.log(`[TradeExecutor] Scanner order placed: ${symbol} notional=$${notional} orderId=${order.id}`);
}
