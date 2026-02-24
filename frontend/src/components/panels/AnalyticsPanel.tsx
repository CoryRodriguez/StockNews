/**
 * Analytics Panel
 *
 * Displays trade performance data collected by the backend analytics system.
 * Three tabs:
 *   Overview    — aggregate stats: win rate, avg return, total P&L
 *   By Catalyst — per-catalyst-category performance table
 *   Strategies  — strategy engine recommendations (hold time, trailing stop)
 */
import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";

// ── Types returned by the backend ──────────────────────────────────────────

interface AnalyticsStatus {
  totalTrades: number;
  completedTrades: number;
  activeTracking: number;
  strategyRules: number;
}

interface CategoryStat {
  category: string;
  tier: number;
  tradeCount: number;
  avgReturn: number;
  medianReturn: number;
  winRate: number;
  avgHoldSec: number;
  avgDrawdown: number;
  avgTimeToPeakSec: number;
  avgRelativeVolume: number;
  avgEntryVwapDev: number | null;
}

interface StrategyRule {
  holdDurationSec: number;
  trailingStopPct: number;
  confidence: number;
  sampleSize: number;
  avgReturnPct: number;
  medianReturnPct: number;
  winRate: number;
  phase: 1 | 2;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(n: number, decimals = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

function fmt2(n: number): string {
  return n.toFixed(2);
}

function fmtSec(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

function categoryLabel(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Parse "CATEGORY:CAP:TOD" strategy key into human-readable labels
function parseStrategyKey(key: string): { cat: string; cap: string; tod: string } {
  const [cat = "ALL", cap = "ALL", tod = "ALL"] = key.split(":");
  return {
    cat: categoryLabel(cat),
    cap: cap === "ALL" ? "All Caps" : cap,
    tod: tod === "ALL" ? "All Sessions" : categoryLabel(tod.replace(/_/g, " ")),
  };
}

// ── WinRate Bar ────────────────────────────────────────────────────────────

function WinBar({ rate }: { rate: number }) {
  const pctVal = Math.round(rate * 100);
  const color = pctVal >= 60 ? "bg-up" : pctVal >= 45 ? "bg-yellow-500" : "bg-down";
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 bg-border rounded overflow-hidden">
        <div className={`h-full rounded ${color}`} style={{ width: `${pctVal}%` }} />
      </div>
      <span className="text-[10px] text-muted w-8 text-right">{pctVal}%</span>
    </div>
  );
}

// ── Confidence Dot ─────────────────────────────────────────────────────────

function ConfDot({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.7
      ? "bg-up"
      : confidence >= 0.4
      ? "bg-yellow-500"
      : "bg-muted";
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1`} />
  );
}

// ── Tab: Overview ──────────────────────────────────────────────────────────

function OverviewTab({
  status,
  categories,
}: {
  status: AnalyticsStatus | null;
  categories: CategoryStat[];
}) {
  if (!status) {
    return (
      <div className="text-muted text-xs text-center py-6">Loading…</div>
    );
  }

  // Aggregate across all categories with data
  const allReturns = categories.flatMap((c) =>
    Array(c.tradeCount).fill(c.avgReturn)
  );
  const totalCompleted = status.completedTrades;
  const overallWinRate =
    categories.length > 0
      ? categories.reduce((s, c) => s + c.winRate * c.tradeCount, 0) /
        Math.max(1, categories.reduce((s, c) => s + c.tradeCount, 0))
      : 0;
  const overallAvgReturn =
    allReturns.length > 0
      ? allReturns.reduce((s, v) => s + v, 0) / allReturns.length
      : 0;

  const statCard = (label: string, value: string, sub?: string, color?: string) => (
    <div className="bg-surface border border-border rounded p-2 flex flex-col gap-0.5">
      <span className="text-muted text-[10px] uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-semibold font-mono ${color ?? "text-white"}`}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted">{sub}</span>}
    </div>
  );

  const winColor =
    overallWinRate >= 0.6
      ? "text-up"
      : overallWinRate >= 0.45
      ? "text-yellow-400"
      : "text-down";

  const returnColor = overallAvgReturn >= 0 ? "text-up" : "text-down";

  return (
    <div className="p-2 flex flex-col gap-2">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2">
        {statCard("Total Trades", String(status.totalTrades), `${totalCompleted} completed`)}
        {statCard(
          "Win Rate",
          `${Math.round(overallWinRate * 100)}%`,
          `across ${categories.length} categories`,
          winColor
        )}
        {statCard(
          "Avg Return",
          `${overallAvgReturn >= 0 ? "+" : ""}${overallAvgReturn.toFixed(2)}%`,
          "at exit",
          returnColor
        )}
        {statCard(
          "Tracking Active",
          String(status.activeTracking),
          `${status.strategyRules} strategy rules`
        )}
      </div>

      {/* Top performers */}
      {categories.length > 0 && (
        <div>
          <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
            Top Categories by Avg Return
          </div>
          <div className="flex flex-col gap-0.5">
            {[...categories]
              .sort((a, b) => b.avgReturn - a.avgReturn)
              .slice(0, 5)
              .map((c) => (
                <div
                  key={c.category}
                  className="flex items-center justify-between text-[11px] px-1"
                >
                  <span className="text-white truncate max-w-[130px]">
                    {categoryLabel(c.category)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted">{c.tradeCount} trades</span>
                    <span
                      className={`font-mono w-14 text-right ${
                        c.avgReturn >= 0 ? "text-up" : "text-down"
                      }`}
                    >
                      {pct(c.avgReturn)}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {categories.length === 0 && totalCompleted === 0 && (
        <div className="text-muted text-xs text-center py-3">
          No completed trades yet — analytics will populate as paper trades finish.
        </div>
      )}
    </div>
  );
}

// ── Tab: By Catalyst ───────────────────────────────────────────────────────

type SortKey = "category" | "tradeCount" | "winRate" | "avgReturn" | "avgHoldSec" | "avgEntryVwapDev";

function ByCatalystTab({ categories }: { categories: CategoryStat[] }) {
  const [sortBy, setSortBy] = useState<SortKey>("avgReturn");
  const [asc, setAsc] = useState(false);

  if (categories.length === 0) {
    return (
      <div className="text-muted text-xs text-center py-6">
        No completed trade analytics yet.
      </div>
    );
  }

  const sorted = [...categories].sort((a, b) => {
    let diff = 0;
    if (sortBy === "category") diff = a.category.localeCompare(b.category);
    else if (sortBy === "tradeCount") diff = a.tradeCount - b.tradeCount;
    else if (sortBy === "winRate") diff = a.winRate - b.winRate;
    else if (sortBy === "avgReturn") diff = a.avgReturn - b.avgReturn;
    else if (sortBy === "avgHoldSec") diff = a.avgHoldSec - b.avgHoldSec;
    else if (sortBy === "avgEntryVwapDev")
      diff = (a.avgEntryVwapDev ?? -999) - (b.avgEntryVwapDev ?? -999);
    return asc ? diff : -diff;
  });

  const col = (key: SortKey, label: string, extraClass = "") => (
    <th
      className={`text-left text-[10px] text-muted uppercase tracking-wide pb-1 cursor-pointer select-none ${extraClass}`}
      onClick={() => {
        if (sortBy === key) setAsc((v) => !v);
        else { setSortBy(key); setAsc(false); }
      }}
    >
      {label}
      {sortBy === key && <span className="ml-0.5">{asc ? "↑" : "↓"}</span>}
    </th>
  );

  return (
    <div className="p-2 overflow-x-auto">
      <table className="w-full text-[11px] font-mono border-collapse">
        <thead>
          <tr>
            {col("category", "Category")}
            {col("tradeCount", "#", "w-6 text-center")}
            {col("winRate", "Win%", "w-20")}
            {col("avgReturn", "Avg Ret", "w-16 text-right")}
            {col("avgHoldSec", "Avg Hold", "w-14 text-right")}
            {col("avgEntryVwapDev", "VWAP Δ", "w-14 text-right")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.category} className="border-t border-border hover:bg-surface">
              <td className="py-1 pr-2 text-white truncate max-w-[140px]">
                {categoryLabel(c.category)}
              </td>
              <td className="text-center text-muted">{c.tradeCount}</td>
              <td className="pr-2">
                <WinBar rate={c.winRate} />
              </td>
              <td
                className={`text-right ${
                  c.avgReturn >= 0 ? "text-up" : "text-down"
                }`}
              >
                {pct(c.avgReturn)}
              </td>
              <td className="text-right text-muted">{fmtSec(c.avgHoldSec)}</td>
              <td
                className={`text-right text-[10px] ${
                  c.avgEntryVwapDev == null
                    ? "text-muted"
                    : c.avgEntryVwapDev > 10
                    ? "text-down"
                    : c.avgEntryVwapDev > 0
                    ? "text-yellow-400"
                    : "text-up"
                }`}
                title="Avg VWAP deviation at entry. High positive = extended above VWAP (reversion risk)."
              >
                {c.avgEntryVwapDev != null ? pct(c.avgEntryVwapDev) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Strategy Engine ───────────────────────────────────────────────────

function StrategiesTab({
  strategies,
}: {
  strategies: Record<string, StrategyRule>;
}) {
  const entries = Object.entries(strategies);

  if (entries.length === 0) {
    return (
      <div className="text-muted text-xs text-center py-6">
        No strategy rules yet — need at least 3 completed trades per category.
      </div>
    );
  }

  // Sort: global first, then by confidence desc
  const sorted = [...entries].sort(([ka, a], [kb, b]) => {
    if (ka === "ALL:ALL:ALL") return -1;
    if (kb === "ALL:ALL:ALL") return 1;
    return b.confidence - a.confidence;
  });

  return (
    <div className="p-2 flex flex-col gap-1.5 overflow-y-auto">
      {sorted.map(([key, rule]) => {
        const { cat, cap, tod } = parseStrategyKey(key);
        const isGlobal = key === "ALL:ALL:ALL";
        return (
          <div
            key={key}
            className={`border rounded p-2 text-[11px] font-mono ${
              isGlobal
                ? "border-blue-500/40 bg-blue-500/5"
                : "border-border bg-panel"
            }`}
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-1">
              <span className={`font-semibold ${isGlobal ? "text-blue-400" : "text-white"}`}>
                {isGlobal ? "Global Default" : cat}
              </span>
              <div className="flex items-center gap-1 text-[10px] text-muted">
                <ConfDot confidence={rule.confidence} />
                <span>{Math.round(rule.confidence * 100)}% conf</span>
                <span>·</span>
                <span>n={rule.sampleSize}</span>
                <span>·</span>
                <span className="text-[9px] bg-surface border border-border rounded px-1">
                  Phase {rule.phase}
                </span>
              </div>
            </div>

            {/* Context badges */}
            {!isGlobal && (
              <div className="flex gap-1 mb-1.5">
                <span className="text-[9px] bg-surface border border-border rounded px-1 text-muted">
                  {cap}
                </span>
                <span className="text-[9px] bg-surface border border-border rounded px-1 text-muted">
                  {tod}
                </span>
              </div>
            )}

            {/* Recommendation metrics */}
            <div className="grid grid-cols-4 gap-1 text-[10px]">
              <div className="flex flex-col">
                <span className="text-muted">Hold</span>
                <span className="text-white font-semibold">
                  {fmtSec(rule.holdDurationSec)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted">Trail Stop</span>
                <span className="text-white font-semibold">
                  {fmt2(rule.trailingStopPct)}%
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted">Win Rate</span>
                <span
                  className={`font-semibold ${
                    rule.winRate >= 0.6
                      ? "text-up"
                      : rule.winRate >= 0.45
                      ? "text-yellow-400"
                      : "text-down"
                  }`}
                >
                  {Math.round(rule.winRate * 100)}%
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted">Avg Ret</span>
                <span
                  className={`font-semibold ${
                    rule.avgReturnPct >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {pct(rule.avgReturnPct)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── CSV Export hook ────────────────────────────────────────────────────────

function useExportCsv(token: string | null) {
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    if (!token || exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/analytics/export.csv", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trade_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore
    } finally {
      setExporting(false);
    }
  };

  return { exportCsv, exporting };
}

// ── Main Panel ─────────────────────────────────────────────────────────────

type Tab = "overview" | "catalyst" | "strategies";

export function AnalyticsPanel() {
  const token = useAuthStore((s) => s.token);
  const [tab, setTab] = useState<Tab>("overview");
  const { exportCsv, exporting } = useExportCsv(token);

  const [status, setStatus] = useState<AnalyticsStatus | null>(null);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [strategies, setStrategies] = useState<Record<string, StrategyRule>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    setLoading(true);
    Promise.all([
      fetch("/api/analytics/status", { headers }).then((r) => r.json()),
      fetch("/api/analytics/performance/by-category", { headers }).then((r) => r.json()),
      fetch("/api/analytics/strategies", { headers }).then((r) => r.json()),
    ])
      .then(([s, cats, strats]) => {
        setStatus(s as AnalyticsStatus);
        setCategories(Array.isArray(cats) ? (cats as CategoryStat[]) : []);
        setStrategies(
          strats && typeof strats === "object" ? (strats as Record<string, StrategyRule>) : {}
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Refresh every 60s
    const interval = setInterval(() => {
      Promise.all([
        fetch("/api/analytics/status", { headers }).then((r) => r.json()),
        fetch("/api/analytics/performance/by-category", { headers }).then((r) => r.json()),
        fetch("/api/analytics/strategies", { headers }).then((r) => r.json()),
      ])
        .then(([s, cats, strats]) => {
          setStatus(s as AnalyticsStatus);
          setCategories(Array.isArray(cats) ? (cats as CategoryStat[]) : []);
          setStrategies(
            strats && typeof strats === "object"
              ? (strats as Record<string, StrategyRule>)
              : {}
          );
        })
        .catch(() => {});
    }, 60_000);

    return () => clearInterval(interval);
  }, [token]);

  const tabBtn = (id: Tab, label: string) => (
    <button
      className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
        tab === id
          ? "bg-accent text-white"
          : "text-muted hover:text-white"
      }`}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-panel shrink-0">
        <span className="text-white text-xs font-semibold">Analytics</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {tabBtn("overview", "Overview")}
            {tabBtn("catalyst", "By Catalyst")}
            {tabBtn("strategies", "Strategies")}
          </div>
          <button
            onClick={exportCsv}
            disabled={exporting}
            title="Export all completed trades as CSV for analysis"
            className="px-2 py-0.5 text-[11px] rounded border border-border text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-40"
          >
            {exporting ? "…" : "↓ CSV"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-muted text-xs text-center py-6">Loading analytics…</div>
        ) : tab === "overview" ? (
          <OverviewTab status={status} categories={categories} />
        ) : tab === "catalyst" ? (
          <ByCatalystTab categories={categories} />
        ) : (
          <StrategiesTab strategies={strategies} />
        )}
      </div>
    </div>
  );
}
