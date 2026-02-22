import { create } from "zustand";
import { Watchlist, WatchlistItem } from "../types";

interface WatchlistState {
  lists: Watchlist[];
  activeListId: string | null;
  prices: Record<string, WatchlistItem>;
  setLists: (lists: Watchlist[]) => void;
  setActiveList: (id: string) => void;
  updatePrice: (ticker: string, price: number) => void;
  setSnapshot: (snapshot: Partial<WatchlistItem> & { ticker: string }) => void;
  addTicker: (ticker: string) => void;
  removeTicker: (ticker: string) => void;
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  lists: [],
  activeListId: null,
  prices: {},

  setLists: (lists) =>
    set({ lists, activeListId: lists[0]?.id ?? null }),

  setActiveList: (id) => set({ activeListId: id }),

  updatePrice: (ticker, price) =>
    set((s) => {
      const prev = s.prices[ticker];
      const prevClose = prev?.prevClose ?? price;
      const changeDollar = price - prevClose;
      const changePct = prevClose > 0 ? (changeDollar / prevClose) * 100 : 0;
      return {
        prices: {
          ...s.prices,
          [ticker]: { ...prev, ticker, price, changePct, changeDollar, prevClose },
        },
      };
    }),

  setSnapshot: (snapshot) =>
    set((s) => {
      const prev = s.prices[snapshot.ticker];
      const price = snapshot.price ?? prev?.price ?? 0;
      const prevClose = snapshot.prevClose ?? prev?.prevClose ?? price;
      const changeDollar = price - prevClose;
      const changePct = prevClose > 0 ? (changeDollar / prevClose) * 100 : 0;
      return {
        prices: {
          ...s.prices,
          [snapshot.ticker]: {
            ...prev,
            ...snapshot,
            price,
            prevClose,
            changeDollar,
            changePct,
          },
        },
      };
    }),

  addTicker: (ticker) => {
    const { lists, activeListId } = get();
    if (!activeListId) return;
    set({
      lists: lists.map((l) =>
        l.id === activeListId && !l.tickers.includes(ticker)
          ? { ...l, tickers: [...l.tickers, ticker] }
          : l
      ),
    });
  },

  removeTicker: (ticker) => {
    const { lists, activeListId } = get();
    if (!activeListId) return;
    set({
      lists: lists.map((l) =>
        l.id === activeListId
          ? { ...l, tickers: l.tickers.filter((t) => t !== ticker) }
          : l
      ),
    });
  },
}));
