import { useEffect, useCallback } from "react";
import { TopNav } from "../components/layout/TopNav";
import { useScreenerStore, selectFilteredRows } from "../store/screenerStore";
import { useDashboardStore } from "../store/dashboardStore";
import { useNewsStore } from "../store/newsStore";
import { useAuthStore } from "../store/authStore";
import { ChartPanel } from "../components/panels/ChartPanel";
import { ScreenerRow } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function pctClass(v: number): string {
  if (v > 0) return "text-green-400";
  if (v < 0) return "text-red-400";
  return "text-muted";
}

type ColDef = {
  key: keyof ScreenerRow;
  label: string;
  align?: "left" | "right";
  render: (row: ScreenerRow) => React.ReactNode;
  width?: string;
};

const COLUMNS: ColDef[] = [
  {
    key: "ticker",
    label: "Ticker",
    align: "left",
    width: "w-[72px]",
    render: (r) => <span className="text-white font-bold">{r.ticker}</span>,
  },
  {
    key: "price",
    label: "Price",
    align: "right",
    width: "w-[64px]",
    render: (r) => `$${r.price.toFixed(2)}`,
  },
  {
    key: "changePct",
    label: "Chg%",
    align: "right",
    width: "w-[64px]",
    render: (r) => (
      <span className={pctClass(r.changePct)}>
        {r.changePct > 0 ? "+" : ""}
        {r.changePct.toFixed(2)}%
      </span>
    ),
  },
  {
    key: "gapPct",
    label: "Gap%",
    align: "right",
    width: "w-[64px]",
    render: (r) => (
      <span className={pctClass(r.gapPct)}>
        {r.gapPct > 0 ? "+" : ""}
        {r.gapPct.toFixed(2)}%
      </span>
    ),
  },
  {
    key: "volume",
    label: "Volume",
    align: "right",
    width: "w-[72px]",
    render: (r) => fmt(r.volume),
  },
  {
    key: "float",
    label: "Float",
    align: "right",
    width: "w-[72px]",
    render: (r) => fmt(r.float),
  },
  {
    key: "shortInterest",
    label: "SI%",
    align: "right",
    width: "w-[48px]",
    render: (r) =>
      r.shortInterest != null ? `${r.shortInterest.toFixed(1)}%` : "\u2014",
  },
  {
    key: "relativeVolume",
    label: "RVol",
    align: "right",
    width: "w-[56px]",
    render: (r) => `${r.relativeVolume.toFixed(1)}x`,
  },
  {
    key: "marketCap",
    label: "MktCap",
    align: "right",
    width: "w-[72px]",
    render: (r) => fmt(r.marketCap),
  },
  {
    key: "hasNews",
    label: "News",
    align: "left",
    render: (r) =>
      r.newsHeadline ? (
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
          <span className="truncate">{r.newsHeadline}</span>
        </span>
      ) : (
        <span className="text-muted">\u2014</span>
      ),
  },
];

// ── Filter Bar ────────────────────────────────────────────────────────────

function FilterBar({ total, showing }: { total: number; showing: number }) {
  const { filters, setFilter, resetFilters } = useScreenerStore();

  const numInput = (
    label: string,
    filterKey: keyof typeof filters,
    placeholder: string
  ) => (
    <label className="flex items-center gap-1">
      <span className="text-[10px] text-muted uppercase">{label}</span>
      <input
        type="number"
        placeholder={placeholder}
        value={filters[filterKey] ?? ""}
        onChange={(e) =>
          setFilter(filterKey, e.target.value === "" ? null : Number(e.target.value))
        }
        className="w-16 bg-surface border border-border rounded px-1.5 py-0.5 text-[11px] text-white font-mono focus:border-blue-500 focus:outline-none"
      />
    </label>
  );

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-panel border-b border-border font-mono flex-wrap">
      {numInput("Min $", "minPrice", "0")}
      {numInput("Max $", "maxPrice", "999")}
      <span className="text-border">|</span>
      {numInput("Min Float (M)", "minFloat", "0")}
      {numInput("Max Float (M)", "maxFloat", "")}
      <span className="text-border">|</span>
      {numInput("Min RVol", "minRvol", "0")}

      <button
        onClick={resetFilters}
        className="text-[10px] text-muted hover:text-white px-2 py-0.5 rounded border border-border hover:border-white/20 transition-colors"
      >
        Reset
      </button>

      <span className="ml-auto text-[10px] text-muted">
        {showing} of {total} stocks
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function ScannerPage() {
  const token = useAuthStore((s) => s.token);
  const store = useScreenerStore();
  const { setRows, sortKey, sortDir, setSort } = store;
  const filtered = selectFilteredRows(store);
  const activeTicker = useDashboardStore((s) => s.activeTicker);
  const setActiveTicker = useDashboardStore((s) => s.setActiveTicker);
  const setFilterTicker = useNewsStore((s) => s.setFilterTicker);

  const chartSymbol = activeTicker || "AMEX:SPY";

  // Hydrate on mount
  useEffect(() => {
    if (!token) return;
    fetch("/api/screener", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d: { rows: ScreenerRow[] }) => setRows(d.rows))
      .catch(() => {});
  }, [token, setRows]);

  const handleRowClick = useCallback(
    (ticker: string) => {
      setActiveTicker(ticker);
      setFilterTicker(ticker);
    },
    [setActiveTicker, setFilterTicker]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-surface overflow-hidden font-mono">
      <TopNav />
      <FilterBar total={store.rows.length} showing={filtered.length} />

      <div className="flex-1 flex gap-2 p-2 overflow-hidden min-h-0">
        {/* Left: data table */}
        <div className="flex-[3] min-w-0 overflow-auto border border-border rounded">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-panel z-10">
              <tr className="border-b border-border">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => setSort(col.key)}
                    className={`text-[10px] text-muted uppercase px-2 py-1.5 cursor-pointer hover:text-white select-none whitespace-nowrap ${
                      col.align === "right" ? "text-right" : "text-left"
                    } ${col.width ?? ""}`}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-0.5 text-blue-400">
                        {sortDir === "asc" ? "\u25B2" : "\u25BC"}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.ticker}
                  onClick={() => handleRowClick(row.ticker)}
                  className="border-b border-border/50 hover:bg-panel cursor-pointer transition-colors"
                >
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`px-2 py-1 whitespace-nowrap ${
                        col.align === "right" ? "text-right" : "text-left"
                      } ${col.width ?? ""} ${
                        col.key === "hasNews" ? "max-w-[200px] truncate" : ""
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="text-center text-muted py-8"
                  >
                    {store.rows.length === 0
                      ? "Waiting for screener data..."
                      : "No stocks match filters"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right: TradingView chart */}
        <div className="flex-[2] min-w-0 border border-border rounded overflow-hidden">
          <ChartPanel panelId="scanner-chart" symbol={chartSymbol} />
        </div>
      </div>
    </div>
  );
}
