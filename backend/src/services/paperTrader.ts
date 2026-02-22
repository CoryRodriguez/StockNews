/**
 * Paper Trading Service
 * Automatically buys 10 shares (paper) when news hits a scanner-active ticker.
 * Schedules a market sell after the configured delay (default 60 s).
 */
import { config } from "../config";
import { prisma } from "../db/client";
import { broadcast } from "../ws/clientHub";
import type { RtprArticle } from "./rtpr";

// Tier 1 = M&A (highest confidence, deal premium = price floor)
// Tier 2 = FDA/Clinical (binary, high magnitude)
// Tier 3 = Earnings (context-dependent)
// Tier 4 = Contract/Government awards (scale-dependent)
// danger = skip trade entirely
export type CatalystType = "tier1" | "tier2" | "tier3" | "tier4" | "other";

// ── Catalyst classification ──────────────────────────────────────────────────

// A pattern is either a single keyword OR an array where ALL must be present.
type Pattern = string | string[];

function matches(lower: string, p: Pattern): boolean {
  return Array.isArray(p) ? p.every((kw) => lower.includes(kw)) : lower.includes(p);
}

// If ANY danger pattern matches, skip the trade entirely.
const DANGER: Pattern[] = [
  "complete response letter",
  ["guidance", "cut"],
  ["guidance", "lower"],
  ["guidance", "reduce"],
  ["offering", "shares"],          // secondary offering = dilution
  "dilution",
  ["medicare", "rate", "below"],
  "going concern",
  ["fda", "reject"],
  ["fda", "refuse"],
  ["fda", "not approv"],
];

// Tier 1 — M&A: premiums create hard price floors; most reliable
const TIER1: Pattern[] = [
  ["agree", "acqui"],              // "agrees to acquire", "acquisition agreement"
  "take-private",
  ["buyout", "per share"],
  ["acquisition", "billion"],
  ["acquisition", "million"],
  "definitive agreement",
  "going private",
  "tender offer",
  "merger agreement",
  "all-cash",
];

// Tier 2 — FDA/Clinical: binary but very high magnitude
const TIER2: Pattern[] = [
  ["fda", "approv"],               // "FDA approves", "FDA approved", "FDA approval"
  ["phase 3", "met"],
  ["phase iii", "met"],
  ["phase 3", "positive"],
  ["phase iii", "positive"],
  ["phase 3", "success"],
  ["phase iii", "success"],
  "breakthrough therapy designation",
  ["pdufa", "approv"],
  ["nda", "approv"],
  ["bla", "approv"],
];

// Tier 3 — Earnings: moderate moves, works best on beaten-down names
const TIER3: Pattern[] = [
  ["beats", "guidance raised"],
  ["beat", "guidance raised"],
  "earnings beat",
  ["record", "quarter"],
  ["record", "revenue"],
  ["beats", "estimates"],
  ["eps", "beat"],
  ["revenue", "exceeds"],
];

// Tier 4 — Government/Contract awards: small-cap moves most
const TIER4: Pattern[] = [
  ["contract", "dod"],
  ["contract", "defense"],
  ["contract", "department of defense"],
  ["awarded", "million"],
  ["awarded", "billion"],
  "government contract",
];

/** Returns null if the trade should be skipped (danger pattern matched). */
export function classifyCatalyst(headline: string): CatalystType | null {
  const lower = headline.toLowerCase();
  if (DANGER.some((p) => matches(lower, p))) return null;  // skip
  if (TIER1.some((p) => matches(lower, p))) return "tier1";
  if (TIER2.some((p) => matches(lower, p))) return "tier2";
  if (TIER3.some((p) => matches(lower, p))) return "tier3";
  if (TIER4.some((p) => matches(lower, p))) return "tier4";
  return "other";
}

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

  const catalystType = classifyCatalyst(article.title);
  if (catalystType === null) {
    console.log(`[PaperTrader] SKIPPED ${ticker} — danger pattern matched: "${article.title}"`);
    return;
  }

  const qty = config.paperTradeQty;
  const scannerId = scannerIds[0] ?? null;

  console.log(
    `[PaperTrader] Triggered: ${ticker} | catalyst=${catalystType} | scanner=${scannerId}`
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
  let buyOrderId: string;
  try {
    const order = await placeOrder(ticker, "buy", qty);
    buyOrderId = order.id;
    console.log(`[PaperTrader] BUY placed: ${qty} ${ticker} — order ${buyOrderId}`);

    const buyPrice = await waitForFill(buyOrderId);
    const updated = await prisma.paperTrade.update({
      where: { id: trade.id },
      data: {
        buyOrderId,
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
    return; // Don't schedule a sell if buy failed
  }

  // ── SELL (after delay) ───────────────────────────────────────────────────
  setTimeout(async () => {
    try {
      const order = await placeOrder(ticker, "sell", qty);
      console.log(
        `[PaperTrader] SELL placed: ${qty} ${ticker} — order ${order.id}`
      );

      // Mark sell as pending while we wait for fill
      await prisma.paperTrade.update({
        where: { id: trade.id },
        data: { sellOrderId: order.id, sellStatus: "pending" },
      });

      const sellPrice = await waitForFill(order.id);
      const current = await prisma.paperTrade.findUnique({
        where: { id: trade.id },
      });
      const pnl =
        sellPrice != null && current?.buyPrice != null
          ? (sellPrice - current.buyPrice) * qty
          : null;

      const updated = await prisma.paperTrade.update({
        where: { id: trade.id },
        data: {
          sellPrice: sellPrice ?? undefined,
          sellStatus: "filled",
          pnl: pnl ?? undefined,
        },
      });
      broadcast("trades", { type: "trade_update", trade: updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PaperTrader] SELL error for ${ticker}:`, msg);
      const updated = await prisma.paperTrade.update({
        where: { id: trade.id },
        data: { sellStatus: "error" },
      });
      broadcast("trades", { type: "trade_update", trade: updated });
    }
  }, config.paperTradeSellDelaySec * 1000);
}
