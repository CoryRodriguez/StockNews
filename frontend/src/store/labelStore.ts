import { create } from "zustand";

// ── Types ────────────────────────────────────────────────────────────────────

export interface HeadlineLabel {
  id: string;
  signalId: string;
  overrideCategory: string | null;
  overrideTier: number | null;
  notes: string | null;
  aiReclassCategory: string | null;
  aiReclassTier: number | null;
  aiReclassReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FullSignal {
  id: string;
  symbol: string;
  source: string;
  headline: string;
  catalystCategory: string | null;
  catalystTier: number | null;
  outcome: string;
  rejectReason: string | null;
  failedPillar: string | null;
  aiProceed: boolean | null;
  aiConfidence: string | null;
  aiReasoning: string | null;
  winRateAtEval: number | null;
  priceAtEval: number | null;
  relVolAtEval: number | null;
  articleCreatedAt: string | null;
  evaluatedAt: string;
  postRejectPeakPct: number | null;
  label: HeadlineLabel | null;
}

export interface LabelStats {
  totalSignals: number;
  labeledCount: number;
  labeledPct: number;
  categoryBreakdown: { category: string; count: number }[];
}

// ── Valid categories ─────────────────────────────────────────────────────────

export const CATALYST_CATEGORIES = [
  "MA_ACQUISITION", "TENDER_OFFER", "MERGER", "GOING_PRIVATE",
  "FDA_APPROVAL", "FDA_BREAKTHROUGH", "CLINICAL_TRIAL_SUCCESS",
  "EARNINGS_BEAT", "REVENUE_RECORD", "GUIDANCE_RAISE",
  "GOVERNMENT_CONTRACT", "CONTRACT_AWARD", "ANALYST_UPGRADE",
  "PARTNERSHIP", "PRODUCT_LAUNCH", "STOCK_BUYBACK", "OTHER",
] as const;

// ── Store ────────────────────────────────────────────────────────────────────

interface LabelState {
  signals: FullSignal[];
  stats: LabelStats | null;
  loading: boolean;
  outcomeFilter: string | null; // null = all
  selectedSignalId: string | null;

  setSignals: (s: FullSignal[]) => void;
  setStats: (s: LabelStats) => void;
  setLoading: (l: boolean) => void;
  setOutcomeFilter: (f: string | null) => void;
  setSelectedSignalId: (id: string | null) => void;
  updateSignalLabel: (signalId: string, label: HeadlineLabel) => void;
  removeSignalLabel: (signalId: string) => void;
}

export const useLabelStore = create<LabelState>((set) => ({
  signals: [],
  stats: null,
  loading: false,
  outcomeFilter: null,
  selectedSignalId: null,

  setSignals: (signals) => set({ signals }),
  setStats: (stats) => set({ stats }),
  setLoading: (loading) => set({ loading }),
  setOutcomeFilter: (outcomeFilter) => set({ outcomeFilter }),
  setSelectedSignalId: (selectedSignalId) => set({ selectedSignalId }),
  updateSignalLabel: (signalId, label) =>
    set((s) => ({
      signals: s.signals.map((sig) =>
        sig.id === signalId ? { ...sig, label } : sig
      ),
    })),
  removeSignalLabel: (signalId) =>
    set((s) => ({
      signals: s.signals.map((sig) =>
        sig.id === signalId ? { ...sig, label: null } : sig
      ),
    })),
}));
