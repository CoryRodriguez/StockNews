import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ScreenerRow } from "../types";

export interface ScreenerFilters {
  minPrice: number | null;
  maxPrice: number | null;
  minFloat: number | null;
  maxFloat: number | null;
  minRvol: number | null;
}

type SortKey = keyof ScreenerRow;

interface ScreenerState {
  rows: ScreenerRow[];
  filters: ScreenerFilters;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  setRows: (rows: ScreenerRow[]) => void;
  setFilter: <K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) => void;
  resetFilters: () => void;
  setSort: (key: SortKey) => void;
}

const DEFAULT_FILTERS: ScreenerFilters = {
  minPrice: null,
  maxPrice: null,
  minFloat: null,
  maxFloat: null,
  minRvol: null,
};

export const useScreenerStore = create<ScreenerState>()(
  persist(
    (set) => ({
      rows: [],
      filters: { ...DEFAULT_FILTERS },
      sortKey: "changePct" as SortKey,
      sortDir: "desc",
      setRows: (rows) => set({ rows }),
      setFilter: (key, value) =>
        set((s) => ({ filters: { ...s.filters, [key]: value } })),
      resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
      setSort: (key) =>
        set((s) => ({
          sortKey: key,
          sortDir: s.sortKey === key && s.sortDir === "desc" ? "asc" : "desc",
        })),
    }),
    {
      name: "dtdash-screener",
      partialize: (s) => ({
        filters: s.filters,
        sortKey: s.sortKey,
        sortDir: s.sortDir,
      }),
    },
  ),
);

/** Derive filtered + sorted rows (call inside component) */
export function selectFilteredRows(state: ScreenerState): ScreenerRow[] {
  const { rows, filters, sortKey, sortDir } = state;

  let result = rows;

  // Apply filters
  if (filters.minPrice != null) {
    const v = filters.minPrice;
    result = result.filter((r) => r.price >= v);
  }
  if (filters.maxPrice != null) {
    const v = filters.maxPrice;
    result = result.filter((r) => r.price <= v);
  }
  if (filters.minFloat != null) {
    const v = filters.minFloat;
    result = result.filter((r) => r.float != null && r.float <= v * 1_000_000);
  }
  if (filters.maxFloat != null) {
    const v = filters.maxFloat;
    result = result.filter((r) => r.float != null && r.float >= v * 1_000_000);
  }
  if (filters.minRvol != null) {
    const v = filters.minRvol;
    result = result.filter((r) => r.relativeVolume >= v);
  }

  // Sort
  const sorted = [...result].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  return sorted;
}
