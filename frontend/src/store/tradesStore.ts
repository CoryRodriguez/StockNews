import { create } from "zustand";
import { PaperTrade } from "../types";

interface TradesState {
  trades: PaperTrade[];
  upsertTrade: (trade: PaperTrade) => void;
  setTrades: (trades: PaperTrade[]) => void;
}

export const useTradesStore = create<TradesState>((set) => ({
  trades: [],

  upsertTrade: (trade) =>
    set((s) => {
      const idx = s.trades.findIndex((t) => t.id === trade.id);
      if (idx === -1) {
        return { trades: [trade, ...s.trades].slice(0, 100) };
      }
      const next = [...s.trades];
      next[idx] = trade;
      return { trades: next };
    }),

  setTrades: (trades) => set({ trades }),
}));
