/**
 * Signal Engine
 *
 * Evaluates incoming news articles through a 10-step gauntlet before deciding
 * whether to fire a trade signal. Every non-silent-skip outcome writes a
 * BotSignalLog record for auditing.
 *
 * Exported functions:
 *   evaluateBotSignal(article) — run article through full pipeline
 *   notifyReconnect(source)    — called by ws.on("open") after first connect
 *
 * IMPORTANT: Plan 02-03 will replace the "ai-unavailable" placeholder at
 * step 11 and add calls to evaluateBotSignal from the news service files.
 * Do NOT add those hooks here.
 */

import Anthropic from "@anthropic-ai/sdk";
import prisma from "../db/client";
import { config as appConfig } from "../config";
import { getBotState, getBotConfig, isMarketOpen } from "./botController";
import { classifyCatalystGranular } from "./catalystClassifier";
import { getSnapshots } from "./alpaca";
import { getStrategy } from "./strategyEngine";
import { RtprArticle } from "./rtpr";

// ── Module-level state ─────────────────────────────────────────────────────

/** Per-source timestamp of the last WebSocket reconnect. */
const RECONNECT_SUPPRESS_MS = 30_000;
const reconnectAt = new Map<string, number>(); // source → Date.now() at last reconnect

/** Dedup window: suppress duplicate (symbol, normalizedTitle) pairs within 5 minutes. */
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface DedupEntry {
  firedAt: number;
  sources: string[];
}

const dedupMap = new Map<string, DedupEntry>();

// Cleanup expired dedup entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [key, entry] of dedupMap) {
    if (entry.firedAt < cutoff) dedupMap.delete(key);
  }
}, DEDUP_WINDOW_MS);

/** Maximum age of an article before it is considered stale (90 seconds). */
const MAX_ARTICLE_AGE_MS = 90_000;

// ── Anthropic client (lazy init) ───────────────────────────────────────────

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!appConfig.anthropicApiKey) return null; // key absent — no crash
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: appConfig.anthropicApiKey,
      timeout: 2000,
    });
  }
  return anthropicClient;
}

// ── Private helpers ────────────────────────────────────────────────────────

/**
 * Returns true if the source is within the 30-second reconnect suppression window.
 * The window starts when notifyReconnect(source) is called.
 */
function isReconnectSuppressed(source: string): boolean {
  const ts = reconnectAt.get(source);
  return !!ts && Date.now() - ts < RECONNECT_SUPPRESS_MS;
}

/**
 * Returns true if this (symbol, title) pair was already evaluated within the
 * dedup window. If so, the incoming source is recorded in the existing entry.
 * If not, a new entry is created and false is returned.
 *
 * Key is keyed on normalized title (lowercase, alphanumeric only) to catch
 * the same story re-published by multiple sources.
 */
function isDuplicate(symbol: string, title: string, source: string): boolean {
  const key = `${symbol}|${title.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const existing = dedupMap.get(key);
  if (existing && Date.now() - existing.firedAt < DEDUP_WINDOW_MS) {
    existing.sources.push(source);
    return true; // silent skip — caller writes no DB record
  }
  dedupMap.set(key, { firedAt: Date.now(), sources: [source] });
  return false;
}

/**
 * Returns true if the current ET time is within the opening auction window
 * (9:30–9:45 AM ET). Spreads are wide and moves are unreliable during this period.
 */
function isOpeningAuction(): boolean {
  const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const totalMinutes = et.getHours() * 60 + et.getMinutes();
  return totalMinutes >= 9 * 60 + 30 && totalMinutes < 9 * 60 + 45;
}

/**
 * Writes a BotSignalLog record to the database.
 * Errors are logged with a [SignalEngine] prefix and never re-thrown.
 */
async function writeSignalLog(
  data: Parameters<typeof prisma.botSignalLog.create>[0]["data"]
): Promise<void> {
  await prisma.botSignalLog.create({ data }).catch((err) =>
    console.error(
      "[SignalEngine] DB write error:",
      err instanceof Error ? err.message : err
    )
  );
}

// ── AI evaluation ─────────────────────────────────────────────────────────

interface AiEvaluation {
  proceed: boolean;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

/**
 * Calls Claude API to evaluate whether a tier 3-4 article warrants a trade.
 * Returns null if the key is absent (ai-unavailable) or on any error/timeout (ai-timeout).
 */
async function evaluateWithAI(
  symbol: string,
  headline: string,
  body: string,
  priceAtEval: number,
  relVolAtEval: number
): Promise<AiEvaluation | null> {
  const client = getAnthropicClient();
  if (!client) return null; // signals "ai-unavailable" to caller

  try {
    const response = await client.messages.create({
      model: appConfig.claudeSignalModel,
      max_tokens: 150,
      system: `You are a day-trading signal evaluator. Evaluate if a news headline warrants a momentum buy.
Respond with JSON only: {"proceed": true|false, "confidence": "high"|"medium"|"low", "reasoning": "one sentence"}.
Rules: proceed=true only for clear positive catalysts with strong momentum potential. Decline vague, speculative, or negative news.`,
      messages: [
        {
          role: "user",
          content: `Symbol: ${symbol}\nHeadline: ${headline}\nBody: ${body.slice(0, 300)}\nPrice: $${priceAtEval.toFixed(2)}, RelVol: ${relVolAtEval.toFixed(1)}x`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return JSON.parse(text) as AiEvaluation;
  } catch (err) {
    console.warn(
      "[SignalEngine] AI evaluation failed:",
      err instanceof Error ? err.message : err
    );
    return null; // null signals timeout/error to caller
  }
}

// ── Exported: Reconnect notification ──────────────────────────────────────

/**
 * Call this from ws.on("open") (after first connect, not on every open) to
 * suppress signals from that source for 30 seconds. This prevents replayed
 * articles from triggering trades on reconnect.
 *
 * Called by: alpacaNews.ts and rtpr.ts (Plan 02-03 adds these hooks).
 */
export function notifyReconnect(source: string): void {
  reconnectAt.set(source, Date.now());
  console.log(`[SignalEngine] Reconnect cooldown started for source="${source}"`);
}

// ── Exported: Main evaluation pipeline ────────────────────────────────────

/**
 * Evaluate a news article through the full 10-step signal gauntlet.
 *
 * Step 1: Bot must be running (silent skip if not)
 * Step 2: Market must be open (silent skip if not)
 * Step 3: Reconnect cooldown check → reject "reconnect-cooldown"
 * Step 4: Article staleness check (> 90 s) → reject "stale"
 * Step 5: Dedup check (same symbol+title in last 5 min) → silent skip
 * Step 6: Catalyst classification → null = reject "danger-pattern"; tier ≥ 5 = reject "tier-disabled"
 * Step 7: Enabled tier check → reject "tier-disabled"
 * Step 8: Opening auction window (9:30–9:45 AM ET) → reject "opening-auction"
 * Step 9: Strategy win-rate gate → reject "below-win-rate" (bypassed when sampleSize === 0)
 * Step 10: 5 Pillars check (price, relativeVolume) → reject "failed-5-pillars"
 * Step 11: Outcome — tier 1-2: fired (log-only); tier 3-4: skipped (ai-unavailable)
 *
 * Never throws — all errors are caught and logged.
 */
export async function evaluateBotSignal(article: RtprArticle): Promise<void> {
  try {
    // ── Step 1: Bot must be running ───────────────────────────────────────
    // ── Step 2: Market must be open ───────────────────────────────────────
    // Both are silent skips — no DB write.
    if (getBotState() !== "running" || !isMarketOpen()) return;

    const symbol = article.ticker;
    const config = getBotConfig();

    // ── Step 3: Reconnect cooldown ────────────────────────────────────────
    if (isReconnectSuppressed(article.source)) {
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: null,
        catalystTier: null,
        outcome: "rejected",
        rejectReason: "reconnect-cooldown",
        failedPillar: null,
        aiProceed: null,
        aiConfidence: null,
        aiReasoning: null,
        winRateAtEval: null,
        priceAtEval: null,
        relVolAtEval: null,
        articleCreatedAt: article.createdAt ? new Date(article.createdAt) : null,
      });
      return;
    }

    // ── Step 4: Staleness check (> 90 seconds) ────────────────────────────
    const articleAge = Date.now() - new Date(article.createdAt).getTime();
    if (articleAge > MAX_ARTICLE_AGE_MS) {
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: null,
        catalystTier: null,
        outcome: "rejected",
        rejectReason: "stale",
        failedPillar: null,
        aiProceed: null,
        aiConfidence: null,
        aiReasoning: null,
        winRateAtEval: null,
        priceAtEval: null,
        relVolAtEval: null,
        articleCreatedAt: new Date(article.createdAt),
      });
      return;
    }

    // ── Step 5: Dedup check ───────────────────────────────────────────────
    // Silent skip — no DB write for duplicates.
    if (isDuplicate(symbol, article.title, article.source)) return;

    // ── Step 6: Catalyst classification ──────────────────────────────────
    const classification = classifyCatalystGranular(article.title, article.body);

    if (classification === null) {
      // Danger pattern detected
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: null,
        catalystTier: null,
        outcome: "rejected",
        rejectReason: "danger-pattern",
        failedPillar: null,
        aiProceed: null,
        aiConfidence: null,
        aiReasoning: null,
        winRateAtEval: null,
        priceAtEval: null,
        relVolAtEval: null,
        articleCreatedAt: new Date(article.createdAt),
      });
      return;
    }

    if (classification.tier >= 5) {
      // OTHER tier — always disabled
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: classification.category,
        catalystTier: classification.tier,
        outcome: "rejected",
        rejectReason: "tier-disabled",
        failedPillar: null,
        aiProceed: null,
        aiConfidence: null,
        aiReasoning: null,
        winRateAtEval: null,
        priceAtEval: null,
        relVolAtEval: null,
        articleCreatedAt: new Date(article.createdAt),
      });
      return;
    }

    // ── Step 7: Enabled tier gate ─────────────────────────────────────────
    const enabledTiers = config.enabledCatalystTiers.split(",").map(Number);
    if (!enabledTiers.includes(classification.tier)) {
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: classification.category,
        catalystTier: classification.tier,
        outcome: "rejected",
        rejectReason: "tier-disabled",
        failedPillar: null,
        aiProceed: null,
        aiConfidence: null,
        aiReasoning: null,
        winRateAtEval: null,
        priceAtEval: null,
        relVolAtEval: null,
        articleCreatedAt: new Date(article.createdAt),
      });
      return;
    }

    // ── Step 8: Opening auction window (9:30–9:45 AM ET) ─────────────────
    if (isOpeningAuction()) {
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: classification.category,
        catalystTier: classification.tier,
        outcome: "rejected",
        rejectReason: "opening-auction",
        failedPillar: null,
        aiProceed: null,
        aiConfidence: null,
        aiReasoning: null,
        winRateAtEval: null,
        priceAtEval: null,
        relVolAtEval: null,
        articleCreatedAt: new Date(article.createdAt),
      });
      return;
    }

    // ── Step 9: Strategy win-rate gate ────────────────────────────────────
    // Bypass when sampleSize === 0 (no data yet — log winRateAtEval: null).
    const strategy = getStrategy(classification.category, null, new Date());
    if (strategy.sampleSize > 0 && strategy.winRate < config.minWinRate) {
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: classification.category,
        catalystTier: classification.tier,
        outcome: "rejected",
        rejectReason: "below-win-rate",
        failedPillar: null,
        aiProceed: null,
        aiConfidence: null,
        aiReasoning: null,
        winRateAtEval: strategy.winRate,
        priceAtEval: null,
        relVolAtEval: null,
        articleCreatedAt: new Date(article.createdAt),
      });
      return;
    }

    // winRateAtEval is null when sampleSize === 0 (bypass), otherwise the actual rate
    const winRateAtEval = strategy.sampleSize === 0 ? null : strategy.winRate;

    // ── Step 10: 5 Pillars check ──────────────────────────────────────────
    const snaps = await getSnapshots([symbol]);

    // If snapshot is unavailable, treat as failed price pillar
    if (snaps.length === 0) {
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: classification.category,
        catalystTier: classification.tier,
        outcome: "rejected",
        rejectReason: "failed-5-pillars",
        failedPillar: "price",
        aiProceed: null,
        aiConfidence: null,
        aiReasoning: null,
        winRateAtEval,
        priceAtEval: null,
        relVolAtEval: null,
        articleCreatedAt: new Date(article.createdAt),
      });
      return;
    }

    const snap = snaps[0];

    // Pillar 1: Price must be ≤ maxSharePrice
    if (snap.price > config.maxSharePrice) {
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: classification.category,
        catalystTier: classification.tier,
        outcome: "rejected",
        rejectReason: "failed-5-pillars",
        failedPillar: "price",
        aiProceed: null,
        aiConfidence: null,
        aiReasoning: null,
        winRateAtEval,
        priceAtEval: snap.price,
        relVolAtEval: snap.relativeVolume,
        articleCreatedAt: new Date(article.createdAt),
      });
      return;
    }

    // Pillar 2: Relative volume must be ≥ minRelativeVolume
    if (snap.relativeVolume < config.minRelativeVolume) {
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: classification.category,
        catalystTier: classification.tier,
        outcome: "rejected",
        rejectReason: "failed-5-pillars",
        failedPillar: "relative_volume",
        aiProceed: null,
        aiConfidence: null,
        aiReasoning: null,
        winRateAtEval,
        priceAtEval: snap.price,
        relVolAtEval: snap.relativeVolume,
        articleCreatedAt: new Date(article.createdAt),
      });
      return;
    }

    // ── Step 11: Branch on tier ───────────────────────────────────────────
    // Tier 1-2: fast path — log outcome="fired", rejectReason="log-only"
    //   (actual order placement added in Phase 3 — log-only during Phase 2)
    // Tier 3-4: AI classification required — placeholder until Plan 02-03
    const needsAI = classification.tier >= 3;

    if (!needsAI) {
      // Tier 1 or 2: signal fired (log-only mode in Phase 2)
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: classification.category,
        catalystTier: classification.tier,
        outcome: "fired",
        rejectReason: "log-only",
        failedPillar: null,
        aiProceed: null,
        aiConfidence: null,
        aiReasoning: null,
        winRateAtEval,
        priceAtEval: snap.price,
        relVolAtEval: snap.relativeVolume,
        articleCreatedAt: new Date(article.createdAt),
      });
    } else {
      // Tier 3-4: send to Claude API for evaluation
      const priceAtEval = snap.price;
      const relVolAtEval = snap.relativeVolume;

      const aiResult = await evaluateWithAI(
        article.ticker,
        article.title,
        article.body,
        priceAtEval,
        relVolAtEval
      );

      if (aiResult === null) {
        // null = either key absent OR timeout/error
        const reason =
          getAnthropicClient() === null ? "ai-unavailable" : "ai-timeout";
        await writeSignalLog({
          symbol,
          source: article.source,
          headline: article.title,
          catalystCategory: classification.category,
          catalystTier: classification.tier,
          outcome: "rejected",
          rejectReason: reason,
          failedPillar: null,
          aiProceed: null,
          aiConfidence: null,
          aiReasoning: null,
          winRateAtEval,
          priceAtEval,
          relVolAtEval,
          articleCreatedAt: new Date(article.createdAt),
        });
        return;
      }

      if (!aiResult.proceed) {
        await writeSignalLog({
          symbol,
          source: article.source,
          headline: article.title,
          catalystCategory: classification.category,
          catalystTier: classification.tier,
          outcome: "rejected",
          rejectReason: "ai-declined",
          failedPillar: null,
          aiProceed: false,
          aiConfidence: aiResult.confidence,
          aiReasoning: aiResult.reasoning,
          winRateAtEval,
          priceAtEval,
          relVolAtEval,
          articleCreatedAt: new Date(article.createdAt),
        });
        return;
      }

      // AI approved — log-only (Phase 2: no order placed)
      await writeSignalLog({
        symbol,
        source: article.source,
        headline: article.title,
        catalystCategory: classification.category,
        catalystTier: classification.tier,
        outcome: "fired",
        rejectReason: "log-only",
        failedPillar: null,
        aiProceed: true,
        aiConfidence: aiResult.confidence,
        aiReasoning: aiResult.reasoning,
        winRateAtEval,
        priceAtEval,
        relVolAtEval,
        articleCreatedAt: new Date(article.createdAt),
      });
    }
  } catch (err) {
    console.error(
      "[SignalEngine] Unexpected error in evaluateBotSignal:",
      err instanceof Error ? err.message : err
    );
  }
}
