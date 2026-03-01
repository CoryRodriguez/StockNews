import prisma from '../db/client';

export interface GoLiveGate {
  passed: boolean;
  tradeCount: number;       // completed paper trades (all status='closed' BotTrade rows)
  tradeCountMet: boolean;   // >= 30
  winRate: number;          // 0.0–1.0
  winRateMet: boolean;      // >= 0.40
  cleanDays: number;        // consecutive clean trading days found
  cleanDaysMet: boolean;    // >= 5
  blockingReason: string | null;
}

const GATE_MIN_TRADES = 30;
const GATE_MIN_WIN_RATE = 0.40;
const GATE_MIN_CLEAN_DAYS = 5;

export async function evaluateGoLiveGate(): Promise<GoLiveGate> {
  // Sub-check 1 & 2: trade count + win rate
  // Note: BotTrade has no 'mode' field — all status='closed' rows are paper trades
  // by definition (live mode has never been active before gate first passes)
  const allClosed = await prisma.botTrade.findMany({
    where: { status: 'closed' },
    select: { pnl: true },
  });
  const tradeCount = allClosed.length;
  const tradeCountMet = tradeCount >= GATE_MIN_TRADES;

  const winners = allClosed.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = tradeCount > 0 ? winners / tradeCount : 0;
  const winRateMet = winRate >= GATE_MIN_WIN_RATE;

  // Sub-check 3: consecutive clean trading days
  // "Clean day" = BotDailyStats row where tradeCount > 0
  // (server was running and executed trades; crash days likely have missing rows)
  const recentDays = await prisma.botDailyStats.findMany({
    where: { tradeCount: { gt: 0 } },
    orderBy: { date: 'desc' },
    take: 10, // fetch extra to find 5 consecutive
  });
  const cleanDays = countConsecutiveBusinessDays(recentDays.map((d) => d.date));
  const cleanDaysMet = cleanDays >= GATE_MIN_CLEAN_DAYS;

  const passed = tradeCountMet && winRateMet && cleanDaysMet;
  let blockingReason: string | null = null;
  if (!tradeCountMet) {
    blockingReason = `Need ${GATE_MIN_TRADES - tradeCount} more completed trades (have ${tradeCount})`;
  } else if (!winRateMet) {
    blockingReason = `Win rate ${(winRate * 100).toFixed(1)}% below 40% minimum`;
  } else if (!cleanDaysMet) {
    blockingReason = `Only ${cleanDays} of 5 required clean trading days`;
  }

  return {
    passed,
    tradeCount,
    tradeCountMet,
    winRate,
    winRateMet,
    cleanDays,
    cleanDaysMet,
    blockingReason,
  };
}

/**
 * Counts how many consecutive business days (Mon–Fri) appear at the start
 * of sortedDatesDesc (most-recent first). Stops counting at the first gap.
 *
 * Business day adjacency:
 *   - Mon → its predecessor was Fri: expect 3 calendar days gap
 *   - Tue–Fri → predecessor was the day before: expect 1 calendar day gap
 */
function countConsecutiveBusinessDays(sortedDatesDesc: string[]): number {
  if (sortedDatesDesc.length === 0) return 0;

  let count = 1;
  for (let i = 0; i < sortedDatesDesc.length - 1; i++) {
    // Use T12:00:00Z to avoid DST boundary issues when converting to Date
    const curr = new Date(sortedDatesDesc[i] + 'T12:00:00Z');
    const prev = new Date(sortedDatesDesc[i + 1] + 'T12:00:00Z');
    const diffDays = Math.round(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    );
    const currDayOfWeek = curr.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri
    // Monday (1): previous business day was Friday — 3 calendar days ago
    const expectedDiff = currDayOfWeek === 1 ? 3 : 1;
    if (diffDays !== expectedDiff) break;
    count++;
    if (count >= GATE_MIN_CLEAN_DAYS) break;
  }
  return count;
}
