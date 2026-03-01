/**
 * End-of-Day Recap computation service
 *
 * Aggregates BotTrade, BotSignalLog, BotDailyStats, StrategyRule, and SPY/QQQ snapshot data
 * into a structured daily recap with scoring, suggestions, catalyst breakdown, strategy
 * adherence analysis, and benchmarks.
 *
 * Exports: computeRecap, persistRecap, scheduleRecapCron, DailyRecapData, RecapSections
 */
import cron from 'node-cron';
import { Prisma } from '@prisma/client';
import prisma from '../db/client';
import { getTodayDateET } from './botController';
import { getSnapshots } from './alpaca';
import { broadcast } from '../ws/clientHub';

// ─── TypeScript Interfaces ─────────────────────────────────────────────────────

export interface RecapSummary {
  date: string;
  totalPnl: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  score: number;           // 0-100
  signalCount: number;
  firedCount: number;
  bestTrade: { symbol: string; pnl: number } | null;
  worstTrade: { symbol: string; pnl: number } | null;
  spyChangePct: number | null;
  qqqChangePct: number | null;
}

export interface TradeBreakdownRow {
  symbol: string;
  catalystType: string | null;
  catalystTier: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  pnl: number | null;
  exitReason: string | null;
  holdMinutes: number | null;
  entryVwapDev: number | null;
  peakPrice: number | null;
  maxDrawdownPct: number | null;
}

export interface SignalRejectionData {
  rejectionHistogram: Record<string, number>;  // reason → count
  missedOpportunities: Array<{
    symbol: string;
    headline: string;
    rejectReason: string;
    postRejectPeakPct: number;
  }>;
  totalEvaluated: number;
  totalFired: number;
  totalRejected: number;
}

export interface CatalystPerformanceRow {
  category: string;
  tradeCount: number;
  winCount: number;
  winRate: number;
  totalPnl: number;
}

export interface StrategyAdherenceData {
  exitReasonDistribution: Record<string, number>;  // exitReason → count
  trades: Array<{
    symbol: string;
    catalystType: string | null;
    recommendedHoldSec: number | null;
    actualHoldSec: number | null;
    adherenceLabel: string;  // "on-target" | "early-exit" | "overhold"
  }>;
  adherencePct: number;  // 0-1: pct within ±20% of recommended
}

export interface BenchmarkData {
  spyChangePct: number | null;
  qqqChangePct: number | null;
  selfAvg5d: { pnl: number; winRate: number; score: number; signalCount: number } | null;
  selfAvg30d: { pnl: number; winRate: number; score: number; signalCount: number } | null;
}

export interface RecapSections {
  trades: TradeBreakdownRow[];
  signals: SignalRejectionData;
  catalysts: CatalystPerformanceRow[];
  adherence: StrategyAdherenceData;
  suggestions: string[];
}

export interface DailyRecapData {
  date: string;
  summary: RecapSummary;
  sections: RecapSections;
  benchmarks: BenchmarkData;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Returns a Date object representing midnight ET for the given YYYY-MM-DD date.
 * Uses T05:00:00Z as a conservative approximation for Eastern Standard Time.
 * When combined with endOfDayET (+ 24h), this captures the full trading day
 * even during DST transitions (±1hr shift still lands within the 24h window).
 */
function startOfDayET(dateET: string): Date {
  return new Date(`${dateET}T05:00:00Z`);
}

/** Returns startOfDayET(dateET) + 24 hours */
function endOfDayET(dateET: string): Date {
  const start = startOfDayET(dateET);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Clamp a number to [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute a 0-100 composite score from daily performance data.
 *
 * Weighted components:
 * - P&L vs baseline (30%): clamp((totalPnl / 200) * 30, 0, 30)
 * - Win rate (25%): winRate * 25  (winRate is 0-1)
 * - Signal quality (20%): (firedCount / max(signalCount, 1)) * 20
 * - Risk compliance (15%): 15 if no daily-loss-limit breach, else 0
 * - Strategy adherence (10%): adherencePct * 10
 */
function computeScore(data: {
  totalPnl: number;
  winRate: number;
  firedCount: number;
  signalCount: number;
  dailyLossLimitHit: boolean;
  adherencePct: number;
}): number {
  const pnlScore = clamp((data.totalPnl / 200) * 30, 0, 30);
  const winRateScore = clamp(data.winRate * 25, 0, 25);
  const signalScore = clamp((data.firedCount / Math.max(data.signalCount, 1)) * 20, 0, 20);
  const riskScore = data.dailyLossLimitHit ? 0 : 15;
  const adherenceScore = clamp(data.adherencePct * 10, 0, 10);

  return Math.round(pnlScore + winRateScore + signalScore + riskScore + adherenceScore);
}

/**
 * Generate up to 3 rule-based, actionable coaching suggestions from the day's data.
 *
 * Rules (in priority order):
 * 1. Missed opportunity pattern: 2+ rejected signals moved +5% — surface top reason
 * 2. Catalyst strength: any category with 2+ trades at 100% win rate
 * 3. Catalyst weakness: any category with 2+ trades at 0% win rate
 * 4. Early exit: >50% of trades exited via hard_stop
 * 5. Overhold: >50% of trades exceeded recommended hold by >50%
 */
function generateSuggestions(data: DailyRecapData): string[] {
  const suggestions: string[] = [];

  // Rule 1: Missed opportunity pattern
  const missed = data.sections.signals.missedOpportunities;
  if (missed.length >= 2) {
    const reasonCounts: Record<string, number> = {};
    for (const m of missed) {
      reasonCounts[m.rejectReason] = (reasonCounts[m.rejectReason] ?? 0) + 1;
    }
    const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];
    if (topReason) {
      suggestions.push(
        `${topReason[1]} rejected signal(s) moved +5%+ after rejection — most common reason: "${topReason[0]}". Review this filter threshold.`
      );
    }
  }

  if (suggestions.length < 3) {
    // Rule 2: Catalyst strength
    const strongCatalyst = data.sections.catalysts.find(
      (c) => c.tradeCount >= 2 && c.winRate === 1
    );
    if (strongCatalyst) {
      suggestions.push(
        `"${strongCatalyst.category}" had 100% win rate on ${strongCatalyst.tradeCount} trades today — consider increasing position size for this catalyst type.`
      );
    }
  }

  if (suggestions.length < 3) {
    // Rule 3: Catalyst weakness
    const weakCatalyst = data.sections.catalysts.find(
      (c) => c.tradeCount >= 2 && c.winRate === 0
    );
    if (weakCatalyst) {
      suggestions.push(
        `"${weakCatalyst.category}" had 0% win rate on ${weakCatalyst.tradeCount} trades today — consider reducing or disabling this catalyst type.`
      );
    }
  }

  if (suggestions.length < 3) {
    // Rule 4: Early exit pattern — >50% of trades exited via hard_stop
    const trades = data.sections.trades;
    if (trades.length > 0) {
      const hardStopCount = trades.filter((t) => t.exitReason === 'hard_stop').length;
      if (hardStopCount / trades.length > 0.5) {
        suggestions.push(
          `${hardStopCount} of ${trades.length} trades exited via hard stop — consider reviewing your stop-loss percentage (currently triggering too frequently).`
        );
      }
    }
  }

  if (suggestions.length < 3) {
    // Rule 5: Overhold pattern — >50% of trades exceeded recommended hold by >50%
    const adherenceTrades = data.sections.adherence.trades.filter(
      (t) => t.recommendedHoldSec !== null && t.actualHoldSec !== null
    );
    if (adherenceTrades.length > 0) {
      const overholdCount = adherenceTrades.filter((t) => {
        const rec = t.recommendedHoldSec!;
        const actual = t.actualHoldSec!;
        return actual > rec * 1.5;
      }).length;
      if (overholdCount / adherenceTrades.length > 0.5) {
        suggestions.push(
          `${overholdCount} of ${adherenceTrades.length} trades exceeded recommended hold time by 50%+ — consider tightening time-exit logic.`
        );
      }
    }
  }

  return suggestions.slice(0, 3);
}

// ─── Self-Average Computation ─────────────────────────────────────────────────

/**
 * Returns an average of DailyRecap rows from the `days` trading days prior to dateET.
 * Returns null if no prior data exists.
 */
async function getSelfAverages(
  dateET: string,
  days: number,
): Promise<{ pnl: number; winRate: number; score: number; signalCount: number } | null> {
  const rows = await prisma.dailyRecap.findMany({
    where: { date: { lt: dateET } },
    orderBy: { date: 'desc' },
    take: days,
    select: { totalPnl: true, winRate: true, score: true, signalCount: true },
  });
  if (rows.length === 0) return null;
  return {
    pnl: rows.reduce((s, r) => s + r.totalPnl, 0) / rows.length,
    winRate: rows.reduce((s, r) => s + r.winRate, 0) / rows.length,
    score: rows.reduce((s, r) => s + r.score, 0) / rows.length,
    signalCount: rows.reduce((s, r) => s + r.signalCount, 0) / rows.length,
  };
}

// ─── Core computeRecap ────────────────────────────────────────────────────────

/**
 * Compute a full DailyRecapData for the given ET date string ("YYYY-MM-DD").
 *
 * Queries 5 data sources in parallel:
 * - BotTrade (closed, filtered by exitAt in the day's ET window)
 * - BotSignalLog (evaluated in the day's ET window)
 * - BotDailyStats (for dailyLossLimitHit detection)
 * - StrategyRule (for adherence analysis)
 * - SPY + QQQ snapshots (for benchmark changePct)
 */
export async function computeRecap(dateET: string): Promise<DailyRecapData> {
  const dayStart = startOfDayET(dateET);
  const dayEnd = endOfDayET(dateET);

  // 1. Parallel data fetch
  const [trades, signals, dailyStats, strategyRules, snapshotResults, selfAvg5d, selfAvg30d] =
    await Promise.all([
      // Closed trades: filter by exitAt (not createdAt) per RESEARCH.md Pitfall 1
      prisma.botTrade.findMany({
        where: {
          status: 'closed',
          exitAt: { gte: dayStart, lt: dayEnd },
        },
        orderBy: { exitAt: 'asc' },
      }),
      prisma.botSignalLog.findMany({
        where: {
          evaluatedAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      prisma.botDailyStats.findFirst({ where: { date: dateET } }),
      prisma.strategyRule.findMany(),
      getSnapshots(['SPY', 'QQQ']).catch(() => []),
      getSelfAverages(dateET, 5),
      getSelfAverages(dateET, 30),
    ]);

  // 2. Build benchmark data
  const spySnap = snapshotResults.find((s) => s.ticker === 'SPY');
  const qqqSnap = snapshotResults.find((s) => s.ticker === 'QQQ');
  const spyChangePct = spySnap?.changePct ?? null;
  const qqqChangePct = qqqSnap?.changePct ?? null;

  // 3. Compute trade aggregates
  const tradeCount = trades.length;
  const winCount = trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const lossCount = trades.filter((t) => (t.pnl ?? 0) <= 0).length;
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const winRate = tradeCount > 0 ? winCount / tradeCount : 0;

  const sortedByPnl = [...trades].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));
  const bestTrade = sortedByPnl[0]
    ? { symbol: sortedByPnl[0].symbol, pnl: sortedByPnl[0].pnl ?? 0 }
    : null;
  const worstTrade = sortedByPnl[sortedByPnl.length - 1]
    ? { symbol: sortedByPnl[sortedByPnl.length - 1].symbol, pnl: sortedByPnl[sortedByPnl.length - 1].pnl ?? 0 }
    : null;

  // 4. Signal aggregates
  const firedSignals = signals.filter((s) => s.outcome === 'fired');
  const rejectedSignals = signals.filter((s) => s.outcome === 'rejected');
  const signalCount = signals.length;
  const firedCount = firedSignals.length;

  // 5. Build trades section (TradeBreakdownRow[])
  const tradeRows: TradeBreakdownRow[] = trades.map((t) => {
    const holdMs =
      t.entryAt && t.exitAt ? t.exitAt.getTime() - t.entryAt.getTime() : null;
    const holdMinutes = holdMs !== null ? holdMs / 60000 : null;
    return {
      symbol: t.symbol,
      catalystType: t.catalystType ?? null,
      catalystTier: t.catalystTier ?? null,
      entryPrice: t.entryPrice ?? null,
      exitPrice: t.exitPrice ?? null,
      pnl: t.pnl ?? null,
      exitReason: t.exitReason ?? null,
      holdMinutes,
      entryVwapDev: t.entryVwapDev ?? null,
      peakPrice: t.peakPrice ?? null,
      maxDrawdownPct: t.maxDrawdownPct ?? null,
    };
  });

  // 6. Build signals section (SignalRejectionData)
  const rejectionHistogram: Record<string, number> = {};
  for (const s of rejectedSignals) {
    const reason = s.rejectReason ?? 'unknown';
    rejectionHistogram[reason] = (rejectionHistogram[reason] ?? 0) + 1;
  }

  const missedOpportunities = signals
    .filter((s) => s.outcome === 'rejected' && (s.postRejectPeakPct ?? 0) >= 5)
    .map((s) => ({
      symbol: s.symbol,
      headline: s.headline,
      rejectReason: s.rejectReason ?? 'unknown',
      postRejectPeakPct: s.postRejectPeakPct ?? 0,
    }));

  const signalsData: SignalRejectionData = {
    rejectionHistogram,
    missedOpportunities,
    totalEvaluated: signalCount,
    totalFired: firedCount,
    totalRejected: rejectedSignals.length,
  };

  // 7. Build catalysts section (CatalystPerformanceRow[])
  const catalystMap: Record<string, { tradeCount: number; winCount: number; totalPnl: number }> = {};
  for (const t of trades) {
    const cat = t.catalystType ?? 'UNKNOWN';
    if (!catalystMap[cat]) {
      catalystMap[cat] = { tradeCount: 0, winCount: 0, totalPnl: 0 };
    }
    catalystMap[cat].tradeCount++;
    if ((t.pnl ?? 0) > 0) catalystMap[cat].winCount++;
    catalystMap[cat].totalPnl += t.pnl ?? 0;
  }
  const catalystRows: CatalystPerformanceRow[] = Object.entries(catalystMap).map(
    ([category, data]) => ({
      category,
      tradeCount: data.tradeCount,
      winCount: data.winCount,
      winRate: data.tradeCount > 0 ? data.winCount / data.tradeCount : 0,
      totalPnl: data.totalPnl,
    })
  );

  // 8. Build adherence section (StrategyAdherenceData)
  // Build a lookup map: catalystCategory → holdDurationSec (from StrategyRule, preferring ALL buckets)
  const strategyLookup: Record<string, number> = {};
  for (const rule of strategyRules) {
    // Prefer the ALL-bucket rule for the category (simpler lookup than matching cap/tod buckets)
    if (rule.capBucket === 'ALL' && rule.todBucket === 'ALL') {
      strategyLookup[rule.catalystCategory] = rule.holdDurationSec;
    }
  }
  // Fallback: use any rule for this category if no ALL-ALL exists
  for (const rule of strategyRules) {
    if (!(rule.catalystCategory in strategyLookup)) {
      strategyLookup[rule.catalystCategory] = rule.holdDurationSec;
    }
  }

  const exitReasonDistribution: Record<string, number> = {};
  const adherenceTrades: StrategyAdherenceData['trades'] = [];
  let onTargetCount = 0;

  for (const t of trades) {
    // Exit reason distribution
    const exitReason = t.exitReason ?? 'unknown';
    exitReasonDistribution[exitReason] = (exitReasonDistribution[exitReason] ?? 0) + 1;

    // Adherence analysis
    const recommendedHoldSec =
      t.catalystType && strategyLookup[t.catalystType] !== undefined
        ? strategyLookup[t.catalystType]
        : null;

    const actualHoldSec =
      t.entryAt && t.exitAt
        ? (t.exitAt.getTime() - t.entryAt.getTime()) / 1000
        : null;

    let adherenceLabel = 'on-target';
    if (recommendedHoldSec !== null && actualHoldSec !== null) {
      const ratio = actualHoldSec / recommendedHoldSec;
      if (ratio < 0.8) {
        adherenceLabel = 'early-exit';
      } else if (ratio > 1.2) {
        adherenceLabel = 'overhold';
      } else {
        onTargetCount++;
      }
    } else {
      // No recommended hold available — cannot determine adherence, count as on-target
      onTargetCount++;
    }

    adherenceTrades.push({
      symbol: t.symbol,
      catalystType: t.catalystType ?? null,
      recommendedHoldSec,
      actualHoldSec,
      adherenceLabel,
    });
  }

  const adherencePct = tradeCount > 0 ? onTargetCount / tradeCount : 1;

  const adherenceData: StrategyAdherenceData = {
    exitReasonDistribution,
    trades: adherenceTrades,
    adherencePct,
  };

  // 9. Compute score
  // dailyLossLimitHit: check if realizedPnl went significantly negative (proxy: below -$200 threshold)
  // Note: We don't have an explicit dailyLossLimitHit flag; approximate by checking dailyStats
  const dailyLossLimitHit = dailyStats
    ? dailyStats.realizedPnl < -200
    : false;

  const score = computeScore({
    totalPnl,
    winRate,
    firedCount,
    signalCount,
    dailyLossLimitHit,
    adherencePct,
  });

  // 10. Build summary
  const summary: RecapSummary = {
    date: dateET,
    totalPnl,
    tradeCount,
    winCount,
    lossCount,
    winRate,
    score,
    signalCount,
    firedCount,
    bestTrade,
    worstTrade,
    spyChangePct,
    qqqChangePct,
  };

  // 11. Assemble the full DailyRecapData (suggestions need the full data object)
  const sections: RecapSections = {
    trades: tradeRows,
    signals: signalsData,
    catalysts: catalystRows,
    adherence: adherenceData,
    suggestions: [],  // filled in after assembly
  };

  const recapData: DailyRecapData = {
    date: dateET,
    summary,
    sections,
    benchmarks: {
      spyChangePct,
      qqqChangePct,
      selfAvg5d,
      selfAvg30d,
    },
  };

  // Generate suggestions now that full data is assembled
  recapData.sections.suggestions = generateSuggestions(recapData);

  return recapData;
}

// ─── persistRecap ─────────────────────────────────────────────────────────────

/**
 * Compute and persist the recap for the given ET date to the DailyRecap table.
 * Uses upsert so it's idempotent — safe to call multiple times for the same date.
 */
export async function persistRecap(dateET: string): Promise<void> {
  const data = await computeRecap(dateET);
  const { summary, sections } = data;

  await prisma.dailyRecap.upsert({
    where: { date: dateET },
    update: {
      totalPnl: summary.totalPnl,
      tradeCount: summary.tradeCount,
      winCount: summary.winCount,
      lossCount: summary.lossCount,
      winRate: summary.winRate,
      score: summary.score,
      signalCount: summary.signalCount,
      firedCount: summary.firedCount,
      bestTradePnl: summary.bestTrade?.pnl ?? null,
      worstTradePnl: summary.worstTrade?.pnl ?? null,
      spyChangePct: summary.spyChangePct,
      qqqChangePct: summary.qqqChangePct,
      sectionsJson: sections as unknown as Prisma.InputJsonValue,
      computedAt: new Date(),
    },
    create: {
      date: dateET,
      totalPnl: summary.totalPnl,
      tradeCount: summary.tradeCount,
      winCount: summary.winCount,
      lossCount: summary.lossCount,
      winRate: summary.winRate,
      score: summary.score,
      signalCount: summary.signalCount,
      firedCount: summary.firedCount,
      bestTradePnl: summary.bestTrade?.pnl ?? null,
      worstTradePnl: summary.worstTrade?.pnl ?? null,
      spyChangePct: summary.spyChangePct,
      qqqChangePct: summary.qqqChangePct,
      sectionsJson: sections as unknown as Prisma.InputJsonValue,
    },
  });

  console.log(`[EodRecap] Persisted recap for ${dateET} (score=${summary.score}, pnl=${summary.totalPnl.toFixed(2)})`);
}

// ─── scheduleRecapCron ────────────────────────────────────────────────────────

let cronScheduled = false;  // guard against duplicate registration

/**
 * Registers a node-cron job at 4:01 PM ET (weekdays only) that:
 * 1. Persists the recap for today's date to the DailyRecap table
 * 2. Broadcasts 'recap_ready' on the 'bot' WebSocket channel
 *
 * Safe to call multiple times — duplicate registration is prevented by cronScheduled guard.
 */
export function scheduleRecapCron(): void {
  if (cronScheduled) return;
  cronScheduled = true;

  cron.schedule('1 16 * * 1-5', async () => {
    const dateET = getTodayDateET();
    console.log(`[EodRecap] 4:01 PM ET cron — persisting recap for ${dateET}`);
    try {
      await persistRecap(dateET);
      broadcast('bot', { type: 'recap_ready', date: dateET });
      console.log(`[EodRecap] recap_ready broadcast for ${dateET}`);
    } catch (err) {
      console.error('[EodRecap] Cron failed:', err instanceof Error ? err.message : err);
    }
  }, { timezone: 'America/New_York' });

  console.log('[EodRecap] Recap cron scheduled (4:01 PM ET, Mon-Fri)');
}
