import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { useCatalystStore, type MoverEntry, type TrendingKeyword } from "../../store/catalystStore";

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

// ── Component ────────────────────────────────────────────────────────────

export function DailyMoversPanel() {
  const token = useAuthStore((s) => s.token);
  const {
    moverAnalysis,
    moverSelectedDate,
    moverHistory,
    setMoverAnalysis,
    setMoverSelectedDate,
    setMoverHistory,
  } = useCatalystStore();
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);

  // Fetch history dates
  useEffect(() => {
    if (!token) return;
    fetch("/api/catalyst/movers/history?limit=30", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setMoverHistory(data ?? []))
      .catch(() => {});
  }, [token, setMoverHistory]);

  // Fetch analysis for selected date
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/catalyst/movers?date=${moverSelectedDate}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setMoverAnalysis(data ?? null))
      .catch(() => setMoverAnalysis(null))
      .finally(() => setLoading(false));
  }, [token, moverSelectedDate, setMoverAnalysis]);

  // Manual compute
  const handleCompute = async () => {
    if (!token) return;
    setComputing(true);
    try {
      await fetch("/api/catalyst/movers/compute", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignore */ }
    setComputing(false);
  };

  const movers = (moverAnalysis?.moversJson ?? []) as MoverEntry[];
  const keywords = (moverAnalysis?.trendingKeywords ?? []) as TrendingKeyword[];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-xs font-semibold text-white tracking-wide uppercase">
          Daily Movers
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={moverSelectedDate}
            onChange={(e) => setMoverSelectedDate(e.target.value)}
            className="bg-panel border border-border rounded px-2 py-1 text-[10px] font-mono text-white focus:outline-none focus:border-accent"
          >
            {/* Always include current selection */}
            {!moverHistory.some((h) => h.date === moverSelectedDate) && (
              <option value={moverSelectedDate}>{moverSelectedDate}</option>
            )}
            {moverHistory.map((h) => (
              <option key={h.date} value={h.date}>
                {h.date}
              </option>
            ))}
          </select>
          {!moverAnalysis && !loading && (
            <button
              onClick={handleCompute}
              disabled={computing}
              className="px-3 py-1 bg-accent text-white text-[10px] font-medium rounded hover:bg-accent/80 disabled:opacity-40 transition-colors"
            >
              {computing ? "Computing…" : "Compute Now"}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-muted text-xs font-mono">Loading…</span>
        </div>
      ) : !moverAnalysis ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <span className="text-muted text-xs font-mono">
            No analysis available for {moverSelectedDate}
          </span>
          <button
            onClick={handleCompute}
            disabled={computing}
            className="px-4 py-2 bg-accent text-white text-xs font-medium rounded hover:bg-accent/80 disabled:opacity-40 transition-colors"
          >
            {computing ? "Computing…" : "Run Analysis"}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {/* Top 10 movers table */}
          <div className="px-4 py-3">
            <h3 className="text-[10px] text-muted uppercase tracking-wider mb-2 font-medium">
              Top 10 Movers
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted text-[10px] uppercase tracking-wider border-b border-border">
                  <th className="text-left py-1.5 px-2 font-medium">#</th>
                  <th className="text-left py-1.5 px-2 font-medium">Ticker</th>
                  <th className="text-right py-1.5 px-2 font-medium">% Change</th>
                  <th className="text-right py-1.5 px-2 font-medium">Volume</th>
                  <th className="text-right py-1.5 px-2 font-medium">Rel Vol</th>
                  <th className="text-right py-1.5 px-2 font-medium">Open</th>
                  <th className="text-right py-1.5 px-2 font-medium">Close</th>
                </tr>
              </thead>
              <tbody>
                {movers.map((m, i) => (
                  <tr
                    key={m.ticker}
                    className="border-b border-border/20 hover:bg-surface/50"
                  >
                    <td className="py-1.5 px-2 font-mono text-muted">{i + 1}</td>
                    <td className="py-1.5 px-2 font-mono text-white font-semibold">
                      {m.ticker}
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono font-semibold ${
                        m.changePct >= 0 ? "text-up" : "text-down"
                      }`}
                    >
                      {m.changePct >= 0 ? "+" : ""}
                      {m.changePct.toFixed(2)}%
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-muted">
                      {fmtVol(m.volume)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-accent">
                      {m.relVol.toFixed(1)}x
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-muted">
                      ${m.priceOpen.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-white">
                      ${m.priceClose.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Trending keywords */}
          {keywords.length > 0 && (
            <div className="px-4 py-3 border-t border-border/50">
              <h3 className="text-[10px] text-muted uppercase tracking-wider mb-2 font-medium">
                Trending Keywords
              </h3>
              <div className="flex flex-wrap gap-2">
                {keywords.map((kw) => (
                  <div
                    key={kw.keyword}
                    className="bg-raised border border-border/50 rounded-lg px-3 py-2"
                  >
                    <div className="text-xs text-white font-medium mb-0.5">{kw.keyword}</div>
                    <div className="flex items-center gap-2 text-[9px] font-mono">
                      <span className="text-muted">{kw.count} tickers</span>
                      <span
                        className={kw.avgChangePct >= 0 ? "text-up" : "text-down"}
                      >
                        avg {kw.avgChangePct >= 0 ? "+" : ""}
                        {kw.avgChangePct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[9px] text-accent mt-0.5 font-mono">
                      {kw.tickers.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Summary */}
          {moverAnalysis.aiSummary && (
            <div className="px-4 py-3 border-t border-border/50">
              <h3 className="text-[10px] text-muted uppercase tracking-wider mb-2 font-medium">
                AI Market Summary
              </h3>
              <div className="bg-surface rounded-lg border border-border/50 p-3">
                <p className="text-[11px] text-white/80 leading-relaxed whitespace-pre-wrap">
                  {moverAnalysis.aiSummary}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
