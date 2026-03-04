import { create } from "zustand";

// Recap summary matches the API response shape (both persisted and computed)
export interface RecapSummary {
  date: string;
  totalPnl: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  score: number;
  signalCount: number;
  firedCount: number;
  bestTradePnl: number | null;
  worstTradePnl: number | null;
  spyChangePct: number | null;
  qqqChangePct: number | null;
}

// Full recap data (when computed on-demand)
export interface RecapData {
  date: string;
  summary: RecapSummary;
  sections: {
    trades: Array<{
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
    }>;
    signals: {
      rejectionHistogram: Record<string, number>;
      missedOpportunities: Array<{
        symbol: string;
        headline: string;
        rejectReason: string;
        postRejectPeakPct: number;
      }>;
      totalEvaluated: number;
      totalFired: number;
      totalRejected: number;
    };
    catalysts: Array<{
      category: string;
      tradeCount: number;
      winCount: number;
      winRate: number;
      totalPnl: number;
    }>;
    adherence: {
      exitReasonDistribution: Record<string, number>;
      trades: Array<{
        symbol: string;
        catalystType: string | null;
        recommendedHoldSec: number | null;
        actualHoldSec: number | null;
        adherenceLabel: string;
      }>;
      adherencePct: number;
    };
    suggestions: string[];
  };
  benchmarks: {
    spyChangePct: number | null;
    qqqChangePct: number | null;
    selfAvg5d: { pnl: number; winRate: number; score: number; signalCount: number } | null;
    selfAvg30d: { pnl: number; winRate: number; score: number; signalCount: number } | null;
  };
}

interface RecapState {
  recap: RecapData | null;
  loading: boolean;
  error: string | null;
  selectedDate: string; // "YYYY-MM-DD"
  recapUnread: boolean;
  setRecap: (recap: RecapData | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedDate: (date: string) => void;
  setRecapUnread: (unread: boolean) => void;
}

// Default to today's date in CT
function getTodayCT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

export const useRecapStore = create<RecapState>((set) => ({
  recap: null,
  loading: false,
  error: null,
  selectedDate: getTodayCT(),
  recapUnread: false,
  setRecap: (recap) => set({ recap }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setRecapUnread: (unread) => set({ recapUnread: unread }),
}));
