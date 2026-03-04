import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import {
  useCatalystStore,
  type KeywordHit,
  type CategoryStat,
} from "../../store/catalystStore";

// ── Helpers ──────────────────────────────────────────────────────────────

function retCls(v: number | null): string {
  if (v == null) return "text-muted";
  return v >= 0 ? "text-up" : "text-down";
}

function fmtRet(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function timeFmt(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateFmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
  });
}

// ── Component ────────────────────────────────────────────────────────────

export function KeywordTrackerPanel() {
  const token = useAuthStore((s) => s.token);
  const {
    keywordSummary,
    categoryStats,
    recentHits,
    setKeywordData,
    setCategoryStats,
  } = useCatalystStore();
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"stats" | "recent">("stats");

  // Fetch data
  useEffect(() => {
    if (!token) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/catalyst/keywords?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
      fetch(`/api/catalyst/keywords/stats?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
    ])
      .then(([kw, stats]) => {
        setKeywordData(kw.summary ?? [], kw.recent ?? []);
        setCategoryStats(stats ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, days, setKeywordData, setCategoryStats]);

  // Stats summary row
  const todayHits = recentHits.filter((h) => {
    const d = new Date(h.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const avgStars =
    todayHits.length > 0
      ? (todayHits.reduce((s, h) => s + h.aiStars, 0) / todayHits.length).toFixed(1)
      : "—";
  const bestKw = categoryStats.length > 0
    ? categoryStats.reduce((a, b) => (a.avgReturn1h > b.avgReturn1h ? a : b))
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-4">
          <h2 className="text-xs font-semibold text-white tracking-wide uppercase">
            Keyword Tracker
          </h2>
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`text-[10px] px-2 py-0.5 rounded font-mono transition-colors ${
                  days === d
                    ? "bg-accent/20 text-accent"
                    : "text-muted hover:text-white hover:bg-raised"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setView("stats")}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              view === "stats" ? "bg-raised text-white" : "text-muted hover:text-white"
            }`}
          >
            Stats
          </button>
          <button
            onClick={() => setView("recent")}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              view === "recent" ? "bg-raised text-white" : "text-muted hover:text-white"
            }`}
          >
            Recent
          </button>
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="flex items-center gap-6 px-4 py-2 bg-surface border-b border-border/50">
        <div>
          <span className="text-[9px] text-muted uppercase tracking-wider">Today</span>
          <span className="ml-2 text-xs font-mono text-white">{todayHits.length} hits</span>
        </div>
        <div>
          <span className="text-[9px] text-muted uppercase tracking-wider">Avg Stars</span>
          <span className="ml-2 text-xs font-mono text-yellow-400">{avgStars}</span>
        </div>
        <div>
          <span className="text-[9px] text-muted uppercase tracking-wider">Best Category</span>
          <span className="ml-2 text-xs font-mono text-up">
            {bestKw ? `${bestKw.catalystCategory} (+${bestKw.avgReturn1h.toFixed(1)}%)` : "—"}
          </span>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-muted text-xs font-mono">Loading…</span>
        </div>
      ) : view === "stats" ? (
        <StatsView stats={categoryStats} />
      ) : (
        <RecentView hits={recentHits} />
      )}
    </div>
  );
}

// ── Stats table ──────────────────────────────────────────────────────────

function StatsView({ stats }: { stats: CategoryStat[] }) {
  if (stats.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-muted text-xs font-mono">No keyword data yet</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-panel">
          <tr className="text-muted text-[10px] uppercase tracking-wider border-b border-border">
            <th className="text-left py-2 px-3 font-medium">Category</th>
            <th className="text-right py-2 px-3 font-medium">Hits</th>
            <th className="text-right py-2 px-3 font-medium">Avg Stars</th>
            <th className="text-right py-2 px-3 font-medium">1h Ret</th>
            <th className="text-right py-2 px-3 font-medium">4h Ret</th>
            <th className="text-right py-2 px-3 font-medium">EOD Ret</th>
            <th className="text-right py-2 px-3 font-medium">Win %</th>
          </tr>
        </thead>
        <tbody>
          {stats
            .sort((a, b) => b.hitCount - a.hitCount)
            .map((s) => (
              <tr
                key={s.catalystCategory}
                className="border-b border-border/30 hover:bg-surface/50"
              >
                <td className="py-2 px-3 font-mono text-white">
                  {s.catalystCategory.replace(/_/g, " ")}
                </td>
                <td className="py-2 px-3 text-right font-mono text-muted">{s.hitCount}</td>
                <td className="py-2 px-3 text-right font-mono text-yellow-400">{s.avgStars}</td>
                <td className={`py-2 px-3 text-right font-mono ${retCls(s.avgReturn1h)}`}>
                  {fmtRet(s.avgReturn1h)}
                </td>
                <td className={`py-2 px-3 text-right font-mono ${retCls(s.avgReturn4h)}`}>
                  {fmtRet(s.avgReturn4h)}
                </td>
                <td className={`py-2 px-3 text-right font-mono ${retCls(s.avgReturnEod)}`}>
                  {fmtRet(s.avgReturnEod)}
                </td>
                <td
                  className={`py-2 px-3 text-right font-mono ${
                    s.winRate >= 50 ? "text-up" : "text-down"
                  }`}
                >
                  {s.winRate}%
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Recent hits feed ─────────────────────────────────────────────────────

function RecentView({ hits }: { hits: KeywordHit[] }) {
  if (hits.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-muted text-xs font-mono">No recent hits</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {hits.map((h) => (
        <div
          key={h.id}
          className="px-4 py-2.5 border-b border-border/30 hover:bg-surface/50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-mono font-semibold text-xs">{h.ticker}</span>
            <span className="text-yellow-400 text-[10px] font-mono tracking-tight">
              {stars(h.aiStars)}
            </span>
            {h.catalystCategory && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono">
                {h.catalystCategory.replace(/_/g, " ")}
              </span>
            )}
            {h.matchedKeyword && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-raised text-muted font-mono">
                {h.matchedKeyword}
              </span>
            )}
            <span className="ml-auto text-[9px] text-muted font-mono">
              {dateFmt(h.createdAt)} {timeFmt(h.createdAt)}
            </span>
          </div>
          <p className="text-[11px] text-muted/80 line-clamp-1 mb-1">{h.headline}</p>
          <div className="flex items-center gap-4 text-[10px] font-mono">
            <span className="text-muted">
              Entry: {h.priceAtNews != null ? `$${h.priceAtNews.toFixed(2)}` : "—"}
            </span>
            <span className={retCls(h.return1hPct)}>1h: {fmtRet(h.return1hPct)}</span>
            <span className={retCls(h.return4hPct)}>4h: {fmtRet(h.return4hPct)}</span>
            <span className={retCls(h.returnEodPct)}>EOD: {fmtRet(h.returnEodPct)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
