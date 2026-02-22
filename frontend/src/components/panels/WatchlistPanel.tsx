import { useWatchlistStore } from "../../store/watchlistStore";
import { useDashboardStore } from "../../store/dashboardStore";
import { useNewsStore } from "../../store/newsStore";
import { useAuthStore } from "../../store/authStore";
import { useState, useEffect } from "react";
import { WatchlistItem } from "../../types";

function fmt(n: number) { return n?.toFixed(2) ?? "—"; }

function shares(n: number | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function WatchlistPanel() {
  const { lists, activeListId, prices, removeTicker, setSnapshot } = useWatchlistStore();
  const setActiveTicker = useDashboardStore((s) => s.setActiveTicker);
  const setFilterTicker = useNewsStore((s) => s.setFilterTicker);
  const token = useAuthStore((s) => s.token);
  const [addInput, setAddInput] = useState("");

  const activeList = lists.find((l) => l.id === activeListId);
  const tickers = activeList?.tickers ?? [];

  // Poll full snapshot data every 30s for relativeVolume & float
  useEffect(() => {
    if (!tickers.length || !token) return;

    const fetchSnapshots = () => {
      fetch(`/api/snapshots?symbols=${tickers.join(",")}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((snaps: WatchlistItem[]) => {
          for (const snap of snaps) setSnapshot(snap);
        })
        .catch(() => {});
    };

    fetchSnapshots();
    const id = setInterval(fetchSnapshots, 30_000);
    return () => clearInterval(id);
  }, [tickers.join(","), token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddTicker = () => {
    const t = addInput.trim().toUpperCase();
    if (!t) return;
    useWatchlistStore.getState().addTicker(t);
    setAddInput("");
  };

  const handleRowClick = (ticker: string) => {
    setActiveTicker(ticker);
    setFilterTicker(ticker);
  };

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 border-b border-border shrink-0">
        <span className="text-white text-xs font-semibold">Watchlist</span>
        <div className="flex items-center gap-1">
          <input
            value={addInput}
            onChange={(e) => setAddInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleAddTicker()}
            placeholder="Add ticker…"
            className="bg-surface border border-border text-white text-[10px] font-mono rounded px-1.5 py-0.5 w-24 focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleAddTicker}
            className="text-accent text-xs px-1.5 py-0.5 rounded hover:bg-surface"
          >
            +
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[56px_1fr_1fr_1fr_1fr_20px] gap-x-1 px-2 py-0.5 text-[10px] text-muted border-b border-border shrink-0 font-mono">
        <span>Ticker</span>
        <span className="text-right">Price</span>
        <span className="text-right">Chg%</span>
        <span className="text-right">Float</span>
        <span className="text-right">RVol</span>
        <span />
      </div>

      <div className="overflow-y-auto flex-1">
        {tickers.length === 0 && (
          <div className="text-muted text-xs text-center py-4">
            Type a ticker above and press Enter
          </div>
        )}
        {tickers.map((ticker) => {
          const p = prices[ticker];
          const isUp = (p?.changePct ?? 0) >= 0;
          return (
            <div
              key={ticker}
              onClick={() => handleRowClick(ticker)}
              className="grid grid-cols-[56px_1fr_1fr_1fr_1fr_20px] gap-x-1 px-2 py-1 hover:bg-surface cursor-pointer border-b border-border text-xs font-mono group"
            >
              <span className="text-white font-semibold truncate">{ticker}</span>
              <span className="text-right text-white">{p ? `$${fmt(p.price)}` : "—"}</span>
              <span className={`text-right ${isUp ? "text-up" : "text-down"}`}>
                {p ? `${isUp ? "+" : ""}${fmt(p.changePct)}%` : "—"}
              </span>
              <span className="text-right text-muted">{shares(p?.float)}</span>
              <span className="text-right text-muted">
                {p?.relativeVolume != null ? `${p.relativeVolume.toFixed(1)}x` : "—"}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); removeTicker(ticker); }}
                className="text-muted hover:text-down text-[10px] opacity-0 group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
