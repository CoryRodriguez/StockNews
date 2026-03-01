import { create } from "zustand";

// ── Bot domain types ──────────────────────────────────────────────────────────

export interface BotStatus {
  state: "stopped" | "running" | "paused";
  mode: "paper" | "live";
  openPositionCount: number;
  todayRealizedPnl: number;
  todayTradeCount: number;
  dayTradeCount: number;
  marketOpen: boolean;
}

export interface BotPosition {
  id: string;
  symbol: string;
  entryPrice: number | null;
  shares: number | null;
  catalystType: string | null;
  entryAt: string | null;
  status: string;
}

export interface BotTrade {
  id: string;
  symbol: string;
  entryPrice: number | null;
  exitPrice: number | null;
  shares: number | null;
  pnl: number | null;
  catalystType: string | null;
  exitReason: string | null;
  entryAt: string | null;
  exitAt: string | null;
  status: string;
}

export interface BotSignal {
  id: string;
  symbol: string;
  catalystCategory: string | null;
  catalystTier: number | null;
  rejectReason: string | null;
  evaluatedAt: string;
  headline?: string | null;
  source?: string | null;
}

export interface BotConfig {
  enabledCatalystTiers: string;
  positionSizeUsd: number;
  confidenceMultiplierHigh: number;
  confidenceMultiplierMed: number;
  confidenceMultiplierLow: number;
  maxConcurrentPositions: number;
  dailyLossLimitUsd: number;
  minWinRate: number;
  hardStopLossPct: number;
  maxHoldDurationSec: number;
  maxFloatShares: number;
  maxSharePrice: number;
  minRelativeVolume: number;
  tradeSizeStars3: number;
  tradeSizeStars4: number;
  tradeSizeStars5: number;
  profitTargetPct: number;
  trailingStopPct: number;
  trailingStopDollar: number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface BotState {
  status: BotStatus | null;
  positions: BotPosition[];
  trades: BotTrade[];
  signals: BotSignal[];
  config: BotConfig | null;

  setStatus: (s: BotStatus) => void;
  setPositions: (p: BotPosition[]) => void;
  prependTrade: (t: BotTrade) => void;
  setTrades: (t: BotTrade[]) => void;
  prependSignal: (s: BotSignal) => void;
  setSignals: (s: BotSignal[]) => void;
  setConfig: (c: BotConfig) => void;
}

export const useBotStore = create<BotState>((set) => ({
  status: null,
  positions: [],
  trades: [],
  signals: [],
  config: null,

  setStatus: (status) => set({ status }),
  setPositions: (positions) => set({ positions }),
  prependTrade: (t) => set((s) => ({ trades: [t, ...s.trades].slice(0, 100) })),
  setTrades: (trades) => set({ trades }),
  prependSignal: (sig) => set((s) => ({ signals: [sig, ...s.signals].slice(0, 100) })),
  setSignals: (signals) => set({ signals }),
  setConfig: (config) => set({ config }),
}));
