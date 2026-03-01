import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GridPanel, SavedLayout } from "../types";

const DEFAULT_PANELS: GridPanel[] = [
  { id: "scanner-1",   type: "scanner",   scannerId: "news_flow", title: "News Flow",  x: 0, y: 0,  w: 3, h: 14 },
  { id: "scanner-2",   type: "scanner",   scannerId: "gap_up",    title: "Gap Up",     x: 0, y: 14, w: 3, h: 14 },
  { id: "news-1",      type: "news",      newsMode: "firehose",   title: "News Feed",  x: 3, y: 0,  w: 3, h: 28 },
  { id: "chart-1",     type: "chart",     symbol: "NASDAQ:AAPL",                       x: 6, y: 0,  w: 6, h: 16 },
  { id: "watchlist-1", type: "watchlist", title: "Watchlist",                          x: 6, y: 16, w: 6, h: 8  },
  { id: "trades-1",    type: "trades",    title: "Paper Trades",                       x: 6, y: 24, w: 6, h: 4  },
  { id: "bot-1",       type: "bot",       title: "Bot",                                x: 0, y: 28, w: 6, h: 20 },
];

interface DashboardState {
  panels: GridPanel[];
  savedLayouts: SavedLayout[];
  activeTicker: string | null;
  setPanels: (panels: GridPanel[]) => void;
  setActiveTicker: (ticker: string) => void;
  updatePanelSymbol: (panelId: string, symbol: string) => void;
  setSavedLayouts: (layouts: SavedLayout[]) => void;
  loadLayout: (layout: SavedLayout) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      panels: DEFAULT_PANELS,
      savedLayouts: [],
      activeTicker: null,

      setPanels: (panels) => set({ panels }),
      setActiveTicker: (activeTicker) => set({ activeTicker }),

      updatePanelSymbol: (panelId, symbol) =>
        set((s) => ({
          panels: s.panels.map((p) =>
            p.id === panelId ? { ...p, symbol } : p
          ),
        })),

      setSavedLayouts: (savedLayouts) => set({ savedLayouts }),

      loadLayout: (layout) => set({ panels: layout.panels }),
    }),
    { name: "dtdash-layout", partialize: (s) => ({ panels: s.panels }) }
  )
);
