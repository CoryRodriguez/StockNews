/**
 * Paper Trading Service
 *
 * Automatically buys shares (paper) when news hits a scanner-active ticker.
 * Uses the strategy engine to determine optimal hold time and trailing stop
 * instead of a fixed delay.
 */
import { config } from "../config";
import prisma from "../db/client";
import { broadcast } from "../ws/clientHub";
import { getSnapshots } from "./alpaca";
import { classifyCatalystGranular } from "./catalystClassifier";
import { recordTradeAnalytics, recordTradeExit } from "./tradeAnalytics";
import { getStrategy, onTradeCompleted } from "./strategyEngine";
import type { RtprArticle } from "./rtpr";

// Re-export for backward compat
export { classifyCatalyst } from "./paperTraderCompat";
export type { CatalystType } from "./paperTraderCompat";

// ── Cooldown guard — prevent double-buying the same ticker ───────────────────

const recentTrades = new Map<string, number>(); // ticker → last trade timestamp ms

function isCoolingDown(ticker: string): boolean {
  const last = recentTrades.get(ticker);
  if (!last) return false;
  return Date.now() - last < config.paperTradeCooldownMin * 60 * 1000;
}

// ── Alpaca Paper Trading REST helpers ────────────────────────────────────────

const paperHeaders = {
  "APCA-API-Key-ID": config.alpacaApiKey,
  "APCA-API-Secret-Key": config.alpacaApiSecret,
  "Content-Type": "application/json",
};

interface AlpacaOrder {
  id: string;
  status: string;
  filled_avg_price: string | null;
}

async function placeOrder(
  symbol: string,
  side: "buy" | "sell",
  qty: number
): Promise<AlpacaOrder> {
  const res = await fetch(`${config.alpacaPaperUrl}/v2/orders`, {
    method: "POST",
    headers: paperHeaders,
    body: JSON.stringify({
      symbol,
      qty: String(qty),
      side,
      type: "market",
      time_in_force: "day",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca ${side} order failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<AlpacaOrder>;
}

async function getOrder(orderId: string): Promise<AlpacaOrder | null> {
  try {
    const res = await fetch(`${config.alpacaPaperUrl}/v2/orders/${orderId}`, {
      headers: {
        "APCA-API-Key-ID": config.alpacaApiKey,
        "APCA-API-Secret-Key": config.alpacaApiSecret,
      },
    });
    if (!res.ok) return null;
    return res.json() as Promise<AlpacaOrder>;
  } catch {
    return null;
  }
}

/** Poll until the order is filled (or give up after maxWaitMs) */
async function waitForFill(
  orderId: string,
  maxWaitMs = 10_000
): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await delay(2000);
    const order = await getOrder(orderId);
    if (order?.status === "filled" && order.filled_avg_price) {
      return parseFloat(order.filled_avg_price);
    }
  }
  return null;
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── Trailing stop monitor ────────────────────────────────────────────────────

interface ActivePosition {
  tradeId: string;
  analyticsId: string | null;
  ticker: string;
  qty: number;
  entryPrice: number;
  peakPrice: number;
  trailingStopPct: number;
  holdDeadlineSec: number;
  enteredAt: number; // timestamp ms
  timer: ReturnType<typeof setTimeout> | null;
  pollInterval: ReturnType<typeof setInterval> | null;
  sold: boolean;
}

const activePositions = new Map<string, ActivePosition>();

/**
 * Start monitoring a position with a trailing stop + max hold time.
 * Polls every 5s to check the trailing stop, and has a hard deadline
 * based on the strategy engine's recommended hold duration.
 */
function startTrailingStopMonitor(position: ActivePosition) {
  activePositions.set(position.tradeId, position);

  // Hard deadline: sell at max hold time regardless
  position.timer = setTimeout(
    () => executeSell(position, "hold_deadline"),
    position.holdDeadlineSec * 1000
  );

  // Poll every 5 seconds to check trailing stop
  position.pollInterval = setInterval(async () => {
    if (position.sold) return;

    try {
      const snapshots = await getSnapshots([position.ticker]);
      if (!snapshots.length) return;

      const currentPrice = snapshots[0].price;

      // Update peak
      if (currentPrice > position.peakPrice) {
        position.peakPrice = currentPrice;
      }

      // Check trailing stop: if price has dropped trailingStopPct from peak
      const dropFromPeak =
        position.peakPrice > 0
          ? ((position.peakPrice - currentPrice) / position.peakPrice) * 100
          : 0;

      if (dropFromPeak >= position.trailingStopPct && position.peakPrice > position.entryPrice) {
        console.log(
          `[PaperTrader] Trailing stop hit for ${position.ticker}: peak=$${position.peakPrice.toFixed(2)}, now=$${currentPrice.toFixed(2)}, drop=${dropFromPeak.toFixed(1)}%`
        );
        await executeSell(position, "trailing_stop");
      }
    } catch {
      // Snapshot fetch failed — skip this cycle
    }
  }, 5000);

  const elapsed = Math.round(position.holdDeadlineSec);
  console.log(
    `[PaperTrader] Monitoring ${position.ticker}: trailing stop=${position.trailingStopPct.toFixed(1)}%, max hold=${elapsed}s`
  );
}

async function executeSell(position: ActivePosition, reason: string) {
  if (position.sold) return;
  position.sold = true;

  // Clean up timers
  if (position.timer) clearTimeout(position.timer);
  if (position.pollInterval) clearInterval(position.pollInterval);
  activePositions.delete(position.tradeId);

  try {
    const order = await placeOrder(position.ticker, "sell", position.qty);
    console.log(
      `[PaperTrader] SELL placed (${reason}): ${position.qty} ${position.ticker} — order ${order.id}`
    );

    await prisma.paperTrade.update({
      where: { id: position.tradeId },
      data: { sellOrderId: order.id, sellStatus: "pending" },
    });

    const sellPrice = await waitForFill(order.id);
    const current = await prisma.paperTrade.findUnique({
      where: { id: position.tradeId },
    });
    const pnl =
      sellPrice != null && current?.buyPrice != null
        ? (sellPrice - current.buyPrice) * position.qty
        : null;

    const updated = await prisma.paperTrade.update({
      where: { id: position.tradeId },
      data: {
        sellPrice: sellPrice ?? undefined,
        sellStatus: "filled",
        pnl: pnl ?? undefined,
      },
    });
    broadcast("trades", { type: "trade_update", trade: updated });

    // Record exit in analytics
    if (position.analyticsId && sellPrice != null) {
      await recordTradeExit(position.tradeId, sellPrice, new Date());
    }

    // Notify strategy engine that a trade completed
    await onTradeCompleted();

    const holdSec = Math.round((Date.now() - position.enteredAt) / 1000);
    const returnPct =
      sellPrice != null && position.entryPrice > 0
        ? (((sellPrice - position.entryPrice) / position.entryPrice) * 100).toFixed(2)
        : "N/A";
    console.log(
      `[PaperTrader] SOLD ${position.ticker} (${reason}): held=${holdSec}s, return=${returnPct}%, pnl=$${pnl?.toFixed(2) ?? "N/A"}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PaperTrader] SELL error for ${position.ticker}:`, msg);
    const updated = await prisma.paperTrade.update({
      where: { id: position.tradeId },
      data: { sellStatus: "error" },
    });
    broadcast("trades", { type: "trade_update", trade: updated });
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Called by rtpr.ts when a news article arrives for a ticker that is
 * currently on one or more scanner alerts.
 */
export async function executePaperTrade(
  article: RtprArticle,
  scannerIds: string[]
): Promise<void> {
  if (!config.paperTradingEnabled) return;

  const { ticker } = article;

  if (isCoolingDown(ticker)) {
    console.log(`[PaperTrader] ${ticker} — cooldown active, skipping`);
    return;
  }

  // Classify with the granular classifier
  const classification = classifyCatalystGranular(article.title, article.body);
  if (classification === null) {
    console.log(`[PaperTrader] SKIPPED ${ticker} — danger pattern matched: "${article.title}"`);
    return;
  }

  // Map tier to the legacy catalystType string for the PaperTrade record
  const tierMap: Record<number, string> = {
    1: "tier1", 2: "tier2", 3: "tier3", 4: "tier4", 5: "other",
  };
  const catalystType = tierMap[classification.tier] ?? "other";

  const qty = config.paperTradeQty;
  const scannerId = scannerIds[0] ?? null;

  // Get strategy recommendation BEFORE entering the trade
  const strategy = getStrategy(classification.category, null, new Date());

  console.log(
    `[PaperTrader] Triggered: ${ticker} | ${classification.category} (tier ${classification.tier}) | scanner=${scannerId} | strategy: hold=${strategy.holdDurationSec}s, stop=${strategy.trailingStopPct.toFixed(1)}% (confidence=${strategy.confidence.toFixed(2)}, n=${strategy.sampleSize})`
  );

  // Create a pending record immediately so the UI can show it
  const trade = await prisma.paperTrade.create({
    data: {
      ticker,
      qty,
      buyStatus: "pending",
      sellStatus: "awaiting",
      catalyst: article.title,
      catalystType,
      scannerId,
    },
  });

  broadcast("trades", { type: "trade_update", trade });
  recentTrades.set(ticker, Date.now());

  // ── BUY ──────────────────────────────────────────────────────────────────
  let buyPrice: number | null = null;
  try {
    const order = await placeOrder(ticker, "buy", qty);
    console.log(`[PaperTrader] BUY placed: ${qty} ${ticker} — order ${order.id}`);

    buyPrice = await waitForFill(order.id);
    const updated = await prisma.paperTrade.update({
      where: { id: trade.id },
      data: {
        buyOrderId: order.id,
        buyPrice: buyPrice ?? undefined,
        buyStatus: "filled",
      },
    });
    broadcast("trades", { type: "trade_update", trade: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PaperTrader] BUY error for ${ticker}:`, msg);
    const updated = await prisma.paperTrade.update({
      where: { id: trade.id },
      data: { buyStatus: "error" },
    });
    broadcast("trades", { type: "trade_update", trade: updated });
    return;
  }

  if (buyPrice == null) {
    console.error(`[PaperTrader] BUY for ${ticker} — no fill price, skipping sell`);
    return;
  }

  const entryTimestamp = new Date();

  // ── Record analytics ─────────────────────────────────────────────────────
  const analyticsId = await recordTradeAnalytics({
    paperTradeId: trade.id,
    article,
    entryPrice: buyPrice,
    entryTimestamp,
  });

  // ── SELL — dynamic strategy-driven exit ──────────────────────────────────
  // Use the strategy engine's recommended hold time + trailing stop.
  // Falls back to config.paperTradeSellDelaySec if no strategy data.
  const holdDuration =
    strategy.sampleSize > 0
      ? strategy.holdDurationSec
      : config.paperTradeSellDelaySec;
  const trailingStopPct =
    strategy.sampleSize > 0 ? strategy.trailingStopPct : 0; // 0 = disabled

  if (trailingStopPct > 0) {
    // Smart exit: trailing stop + max hold deadline
    startTrailingStopMonitor({
      tradeId: trade.id,
      analyticsId,
      ticker,
      qty,
      entryPrice: buyPrice,
      peakPrice: buyPrice,
      trailingStopPct,
      holdDeadlineSec: holdDuration,
      enteredAt: entryTimestamp.getTime(),
      timer: null,
      pollInterval: null,
      sold: false,
    });
  } else {
    // Fallback: fixed delay sell (original behavior, used when no strategy data)
    setTimeout(async () => {
      const position: ActivePosition = {
        tradeId: trade.id,
        analyticsId,
        ticker,
        qty,
        entryPrice: buyPrice!,
        peakPrice: buyPrice!,
        trailingStopPct: 0,
        holdDeadlineSec: holdDuration,
        enteredAt: entryTimestamp.getTime(),
        timer: null,
        pollInterval: null,
        sold: false,
      };
      await executeSell(position, "fixed_delay");
    }, holdDuration * 1000);
  }
}
