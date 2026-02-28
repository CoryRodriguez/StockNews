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
import { getAlpacaBaseUrl, getBotConfig } from './botController';

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
  notional: number;
  side: 'buy' | 'sell';
  type: 'market';
  time_in_force: 'day';
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
 * Places a notional market buy order via Alpaca REST API.
 * Uses `notional` (dollar amount) NOT `qty` (shares) — EXEC-05.
 *
 * Returns the order response on success, null on failure.
 * On failure: logs error with status code and body — does NOT throw (EXEC-04).
 */
async function placeNotionalBuyOrder(
  symbol: string,
  notional: number
): Promise<AlpacaOrderResponse | null> {
  const body: AlpacaOrderRequest = {
    symbol,
    notional,
    side: 'buy',
    type: 'market',
    time_in_force: 'day',
  };

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

  // Step 4: Place notional buy order
  const order = await placeNotionalBuyOrder(symbol, notional);
  if (order === null) {
    return; // error already logged in placeNotionalBuyOrder
  }

  // Step 5: Create BotTrade record — entryPrice and shares are null until fill event
  await prisma.botTrade.create({
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

  console.log(`[TradeExecutor] Order placed: ${symbol} notional=$${notional} stars=${starRating} orderId=${order.id}`);
}
