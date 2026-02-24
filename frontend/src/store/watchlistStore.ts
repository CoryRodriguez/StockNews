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
  addTicker: (ticker: string, token?: string) => void;
  removeTicker: (ticker: string, token?: string) => void;
}

async function persistTickers(listId: string, tickers: string[], token: string) {
  try {
    await fetch(`/api/watchlists/${listId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tickers }),
    });
  } catch {
    // silent — local state already updated
  }
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

  addTicker: (ticker, token) => {
    const { lists, activeListId } = get();
    if (!activeListId) return;
    const already = lists.find((l) => l.id === activeListId)?.tickers.includes(ticker);
    if (already) return;
    const updated = lists.map((l) =>
      l.id === activeListId ? { ...l, tickers: [...l.tickers, ticker] } : l
    );
    set({ lists: updated });
    const newTickers = updated.find((l) => l.id === activeListId)!.tickers;
    if (token) persistTickers(activeListId, newTickers, token);
  },

  removeTicker: (ticker, token) => {
    const { lists, activeListId } = get();
    if (!activeListId) return;
    const updated = lists.map((l) =>
      l.id === activeListId
        ? { ...l, tickers: l.tickers.filter((t) => t !== ticker) }
        : l
    );
    set({ lists: updated });
    const newTickers = updated.find((l) => l.id === activeListId)!.tickers;
    if (token) persistTickers(activeListId, newTickers, token);
  },
}));
