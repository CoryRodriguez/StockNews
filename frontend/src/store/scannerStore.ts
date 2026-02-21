import { create } from "zustand";
import { ScannerAlert, ScannerDefinition } from "../types";

interface ScannerState {
  definitions: ScannerDefinition[];
  alerts: Record<string, ScannerAlert[]>; // scannerId → alerts
  activeScanners: Set<string>;
  setDefinitions: (defs: ScannerDefinition[]) => void;
  addAlert: (alert: ScannerAlert) => void;
  clearAlert: (scannerId: string, ticker: string) => void;
  toggleScanner: (id: string) => void;
}

export const useScannerStore = create<ScannerState>((set) => ({
  definitions: [],
  alerts: {},
  activeScanners: new Set(["news_flow", "gap_up", "momentum"]), // defaults on

  setDefinitions: (definitions) => set({ definitions }),

  addAlert: (alert) =>
    set((s) => {
      const existing = s.alerts[alert.scannerId] ?? [];
      // Move to top if already present, else prepend
      const filtered = existing.filter((a) => a.ticker !== alert.ticker);
      return {
        alerts: {
          ...s.alerts,
          [alert.scannerId]: [alert, ...filtered].slice(0, 100),
        },
      };
    }),

  clearAlert: (scannerId, ticker) =>
    set((s) => ({
      alerts: {
        ...s.alerts,
        [scannerId]: (s.alerts[scannerId] ?? []).filter((a) => a.ticker !== ticker),
      },
    })),

  toggleScanner: (id) =>
    set((s) => {
      const next = new Set(s.activeScanners);
      next.has(id) ? next.delete(id) : next.add(id);
      return { activeScanners: next };
    }),
}));
