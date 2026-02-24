/**
 * Trades Page
 *
 * Full-page trade journal combining:
 *   - Summary stat cards (total P&L, win rate, avg win/loss, profit factor)
 *   - Monthly calendar heatmap (daily P&L heat coloring)
 *   - Sortable, filterable trade log table
 */
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../store/authStore";
import { TopNav } from "../components/layout/TopNav";

// ── Types ──────────────────────────────────────────────────────────────────

interface TradeAnalyticsSummary {
  catalystCategory: string;
  catalystTier: number;
  newsHeadline: string;
  tradeEnteredAt: string;
  entryPrice: number;
  exitPrice: number | null;
  returnPct: number | null;
  actualHoldSec: number | null;
  isPreMarket: boolean;
  relativeVolume: number;
  entryVwapDev: number | null;
  peakPrice: number | null;
  maxDrawdownPct: number | null;
}

interface JournalTrade {
  id: string;
  ticker: string;
  qty: number;
  buyPrice: number | null;
  buyStatus: string;
  sellPrice: number | null;
  sellStatus: string;
  catalyst: string;
  catalystType: string;
  scannerId: string | null;
  pnl: number | null;
  createdAt: string;
  updatedAt: string;
  analytics: TradeAnalyticsSummary | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

function toDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Dummy P&L data (shown when no real trades exist) ──────────────────────

const DUMMY_PNL_TRADES: { date: string; pnl: number }[] = [
  { date: "2026-01-05", pnl: 42.80 }, { date: "2026-01-06", pnl: -28.50 },
  { date: "2026-01-07", pnl: 95.20 }, { date: "2026-01-08", pnl: 18.75 },
  { date: "2026-01-09", pnl: -55.30 }, { date: "2026-01-12", pnl: 112.40 },
  { date: "2026-01-13", pnl: -32.10 }, { date: "2026-01-14", pnl: 78.60 },
  { date: "2026-01-15", pnl: 145.20 }, { date: "2026-01-16", pnl: -88.75 },
  { date: "2026-01-20", pnl: 62.30 }, { date: "2026-01-21", pnl: 38.90 },
  { date: "2026-01-22", pnl: -24.60 }, { date: "2026-01-23", pnl: 198.40 },
  { date: "2026-01-26", pnl: -42.30 }, { date: "2026-01-27", pnl: 88.50 },
  { date: "2026-01-28", pnl: 125.80 }, { date: "2026-01-29", pnl: -65.40 },
  { date: "2026-01-30", pnl: 92.70 }, { date: "2026-02-02", pnl: 75.30 },
  { date: "2026-02-03", pnl: -38.90 }, { date: "2026-02-04", pnl: 148.60 },
  { date: "2026-02-05", pnl: 55.20 }, { date: "2026-02-06", pnl: -72.40 },
  { date: "2026-02-09", pnl: 118.50 }, { date: "2026-02-10", pnl: 42.80 },
  { date: "2026-02-11", pnl: -28.60 }, { date: "2026-02-12", pnl: 165.30 },
  { date: "2026-02-13", pnl: 88.70 }, { date: "2026-02-17", pnl: -95.40 },
  { date: "2026-02-18", pnl: 112.20 }, { date: "2026-02-19", pnl: 78.50 },
  { date: "2026-02-20", pnl: -45.30 }, { date: "2026-02-23", pnl: 155.80 },
  { date: "2026-02-24", pnl: 92.40 },
];

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-panel border border-border rounded p-3 flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] text-muted uppercase tracking-wide truncate">{label}</span>
      <span className={`text-base font-semibold font-mono truncate ${color ?? "text-white"}`}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted truncate">{sub}</span>}
    </div>
  );
}

// ── Stats Row ─────────────────────────────────────────────────────────────

function StatsRow({ trades }: { trades: JournalTrade[] }) {
  const completed = trades.filter((t) => t.sellStatus === "filled" && t.pnl != null);
  const open = trades.filter((t) => t.buyStatus === "filled" && (t.sellStatus === "awaiting" || t.sellStatus === "pending"));
  const winners = completed.filter((t) => (t.pnl ?? 0) > 0);
  const losers = completed.filter((t) => (t.pnl ?? 0) <= 0);

  const totalPnl = completed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const winRate = completed.length > 0 ? winners.length / completed.length : 0;
  const avgWin = winners.length > 0
    ? winners.reduce((s, t) => s + (t.pnl ?? 0), 0) / winners.length
    : 0;
  const avgLoss = losers.length > 0
    ? losers.reduce((s, t) => s + (t.pnl ?? 0), 0) / losers.length
    : 0;
  const grossProfit = winners.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const pnlColor = totalPnl >= 0 ? "text-up" : "text-down";
  const winColor = winRate >= 0.6 ? "text-up" : winRate >= 0.45 ? "text-yellow-400" : "text-down";

  return (
    <div className="grid grid-cols-6 gap-2 px-4 py-3 border-b border-border bg-surface shrink-0">
      <StatCard
        label="Net P&L"
        value={`${totalPnl >= 0 ? "+" : ""}$${fmt2(totalPnl)}`}
        sub={`${completed.length} closed`}
        color={pnlColor}
      />
      <StatCard
        label="Win Rate"
        value={`${Math.round(winRate * 100)}%`}
        sub={`${winners.length}W / ${losers.length}L`}
        color={winColor}
      />
      <StatCard
        label="Total Trades"
        value={String(trades.length)}
        sub={`${open.length} open`}
      />
      <StatCard
        label="Avg Winner"
        value={winners.length > 0 ? `+$${fmt2(avgWin)}` : "—"}
        sub={`${winners.length} trades`}
        color="text-up"
      />
      <StatCard
        label="Avg Loser"
        value={losers.length > 0 ? `-$${fmt2(Math.abs(avgLoss))}` : "—"}
        sub={`${losers.length} trades`}
        color={losers.length > 0 ? "text-down" : "text-muted"}
      />
      <StatCard
        label="Profit Factor"
        value={
          profitFactor === Infinity
            ? "∞"
            : profitFactor > 0
            ? fmt2(profitFactor)
            : "—"
        }
        sub={grossLoss > 0 ? `$${fmt2(grossProfit)} / $${fmt2(grossLoss)}` : undefined}
        color={profitFactor >= 1.5 ? "text-up" : profitFactor >= 1 ? "text-yellow-400" : "text-down"}
      />
    </div>
  );
}

// ── Calendar Heatmap ──────────────────────────────────────────────────────

function CalendarHeatmap({ trades }: { trades: JournalTrade[] }) {
  const now = new Date();
  const [monthDate, setMonthDate] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1)
  );

  // Build day -> { pnl, count } from completed trades
  const dayMap = useMemo(() => {
    const map = new Map<string, { pnl: number; count: number }>();
    for (const t of trades) {
      if (t.sellStatus !== "filled" || t.pnl == null) continue;
      const key = toDateKey(t.createdAt);
      const existing = map.get(key) ?? { pnl: 0, count: 0 };
      map.set(key, { pnl: existing.pnl + t.pnl, count: existing.count + 1 });
    }
    return map;
  }, [trades]);

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const monthLabel = monthDate.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const allPnls = [...dayMap.values()].map((v) => Math.abs(v.pnl));
  const maxAbsPnl = Math.max(1, ...allPnls);

  const todayKey = toDateKey(now.toISOString());

  const prevMonth = () =>
    setMonthDate((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () =>
    setMonthDate((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  // Build month summary for this displayed month
  const monthPnl = [...dayMap.entries()]
    .filter(([k]) => k.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`))
    .reduce((s, [, v]) => s + v.pnl, 0);
  const monthTrades = [...dayMap.entries()]
    .filter(([k]) => k.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`))
    .reduce((s, [, v]) => s + v.count, 0);

  const cells: React.ReactNode[] = [];

  // Empty offset cells
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(<div key={`e${i}`} />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayData = dayMap.get(dateKey);
    const isToday = dateKey === todayKey;

    let bgStyle: React.CSSProperties | undefined;
    if (dayData) {
      const intensity = Math.min(0.85, 0.18 + 0.67 * (Math.abs(dayData.pnl) / maxAbsPnl));
      bgStyle = {
        backgroundColor:
          dayData.pnl >= 0
            ? `rgba(34, 197, 94, ${intensity})`
            : `rgba(239, 68, 68, ${intensity})`,
      };
    }

    cells.push(
      <div
        key={day}
        className={`relative rounded p-1.5 border flex flex-col min-h-[56px] ${
          isToday ? "border-accent" : "border-border"
        } ${!dayData ? "bg-surface" : ""}`}
        style={dayData ? bgStyle : undefined}
      >
        <span
          className={`text-[10px] font-mono ${
            isToday ? "text-accent font-bold" : "text-white/60"
          }`}
        >
          {day}
        </span>
        {dayData && (
          <div className="mt-auto">
            <div className="text-[11px] font-mono font-semibold text-white leading-none">
              {dayData.pnl >= 0 ? "+" : ""}${dayData.pnl.toFixed(2)}
            </div>
            <div className="text-[9px] text-white/70">{dayData.count} trade{dayData.count !== 1 ? "s" : ""}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-panel border border-border rounded p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="text-muted hover:text-white text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-surface"
        >
          ‹
        </button>
        <div className="flex items-center gap-3">
          <span className="text-white text-xs font-semibold">{monthLabel}</span>
          {monthTrades > 0 && (
            <span
              className={`text-xs font-mono font-semibold ${
                monthPnl >= 0 ? "text-up" : "text-down"
              }`}
            >
              {monthPnl >= 0 ? "+" : ""}${monthPnl.toFixed(2)}
              <span className="text-muted font-normal ml-1">({monthTrades}t)</span>
            </span>
          )}
        </div>
        <button
          onClick={nextMonth}
          className="text-muted hover:text-white text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-surface"
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-[10px] text-muted py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">{cells}</div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-2 justify-end">
        <span className="text-[9px] text-muted">Loss</span>
        <div className="flex gap-0.5">
          {[0.85, 0.55, 0.3].map((o) => (
            <div
              key={o}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: `rgba(239,68,68,${o})` }}
            />
          ))}
          <div className="w-3 h-3 rounded-sm bg-surface border border-border" />
          {[0.3, 0.55, 0.85].map((o) => (
            <div
              key={o}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: `rgba(34,197,94,${o})` }}
            />
          ))}
        </div>
        <span className="text-[9px] text-muted">Gain</span>
      </div>
    </div>
  );
}

// ── P&L Equity Curve ─────────────────────────────────────────────────────

function PnlChart({ trades }: { trades: JournalTrade[] }) {
  const completed = useMemo(
    () =>
      trades
        .filter((t) => t.sellStatus === "filled" && t.pnl != null)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [trades]
  );

  const isDummy = completed.length === 0;

  const points = useMemo(() => {
    if (isDummy) {
      let cum = 0;
      return DUMMY_PNL_TRADES.map((d) => {
        cum += d.pnl;
        return { label: d.date.slice(5), cumPnl: cum, pnl: d.pnl };
      });
    }
    let cum = 0;
    return completed.map((t) => {
      cum += t.pnl ?? 0;
      const d = new Date(t.createdAt);
      return { label: `${d.getMonth() + 1}/${d.getDate()}`, cumPnl: cum, pnl: t.pnl ?? 0 };
    });
  }, [completed, isDummy]);

  if (points.length === 0) return null;

  // SVG coordinate system
  const W = 800, H = 160;
  const PL = 52, PR = 10, PT = 14, PB = 24;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  const minY = Math.min(0, ...points.map((p) => p.cumPnl));
  const maxY = Math.max(0, ...points.map((p) => p.cumPnl));
  const rangeY = maxY - minY || 100;

  const toX = (i: number) =>
    PL + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
  const toY = (v: number) => PT + chartH - ((v - minY) / rangeY) * chartH;
  const zeroY = toY(0);

  const finalPnl = points[points.length - 1].cumPnl;
  const isPositive = finalPnl >= 0;
  const lineColor = isPositive ? "rgb(34,197,94)" : "rgb(239,68,68)";
  const fillColor = isPositive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.cumPnl).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${toX(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${toX(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  const yLabels = [
    { v: maxY, y: toY(maxY) },
    { v: 0, y: zeroY },
    ...(minY < 0 ? [{ v: minY, y: toY(minY) }] : []),
  ];

  const xCount = Math.min(7, points.length);
  const xIndices =
    points.length <= xCount
      ? points.map((_, i) => i)
      : Array.from({ length: xCount }, (_, i) =>
          Math.round((i / (xCount - 1)) * (points.length - 1))
        );

  const peakIdx = points.reduce((b, p, i) => (p.cumPnl > points[b].cumPnl ? i : b), 0);
  const troughIdx = points.reduce((b, p, i) => (p.cumPnl < points[b].cumPnl ? i : b), 0);

  const fmtY = (v: number) =>
    v === 0 ? "0" : `${v > 0 ? "+" : ""}${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`;

  return (
    <div className="bg-panel border border-border rounded p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-white text-xs font-semibold">Cumulative P&amp;L</span>
        <div className="flex items-center gap-2">
          {isDummy && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 rounded">
              DEMO DATA
            </span>
          )}
          <span className={`text-xs font-mono font-semibold ${isPositive ? "text-up" : "text-down"}`}>
            {isPositive ? "+" : ""}${finalPnl.toFixed(2)}
          </span>
          <span className="text-[10px] text-muted">{points.length} trades</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="overflow-visible">
        {/* Zero line */}
        <line x1={PL} y1={zeroY} x2={W - PR} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4,3" />

        {/* Area fill */}
        <path d={areaPath} fill={fillColor} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />

        {/* Peak annotation */}
        <circle cx={toX(peakIdx)} cy={toY(points[peakIdx].cumPnl)} r="3" fill="rgb(34,197,94)" />
        <text x={toX(peakIdx)} y={toY(points[peakIdx].cumPnl) - 6} textAnchor="middle" fill="rgba(34,197,94,0.8)" fontSize="8" fontFamily="monospace">
          +${points[peakIdx].cumPnl.toFixed(0)}
        </text>

        {/* Trough annotation (only if negative) */}
        {points[troughIdx].cumPnl < 0 && (
          <>
            <circle cx={toX(troughIdx)} cy={toY(points[troughIdx].cumPnl)} r="3" fill="rgb(239,68,68)" />
            <text x={toX(troughIdx)} y={toY(points[troughIdx].cumPnl) + 12} textAnchor="middle" fill="rgba(239,68,68,0.8)" fontSize="8" fontFamily="monospace">
              ${points[troughIdx].cumPnl.toFixed(0)}
            </text>
          </>
        )}

        {/* Y-axis labels */}
        {yLabels.map(({ v, y }) => (
          <text key={v} x={PL - 4} y={y} textAnchor="end" dominantBaseline="middle" fill="rgba(255,255,255,0.35)" fontSize="9" fontFamily="monospace">
            {fmtY(v)}
          </text>
        ))}

        {/* X-axis labels */}
        {xIndices.map((idx) => (
          <text key={idx} x={toX(idx)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="monospace">
            {points[idx].label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Trade Log ─────────────────────────────────────────────────────────────

type SortKey =
  | "createdAt"
  | "ticker"
  | "pnl"
  | "returnPct"
  | "actualHoldSec"
  | "entryPrice"
  | "relativeVolume";

type FilterMode = "all" | "wins" | "losses" | "open";

function statusBadge(t: JournalTrade) {
  if (t.buyStatus === "error")
    return <span className="text-[10px] text-down">BUY ERR</span>;
  if (t.buyStatus === "pending")
    return <span className="text-[10px] text-yellow-400">BUYING</span>;
  if (t.sellStatus === "awaiting" || t.sellStatus === "pending")
    return <span className="text-[10px] text-blue-400">HOLDING</span>;
  if (t.sellStatus === "error")
    return <span className="text-[10px] text-down">SELL ERR</span>;
  return <span className="text-[10px] text-muted">CLOSED</span>;
}

function TradeLog({ trades }: { trades: JournalTrade[] }) {
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [asc, setAsc] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [token] = [useAuthStore((s) => s.token)];
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    switch (filter) {
      case "wins":
        return trades.filter((t) => t.sellStatus === "filled" && (t.pnl ?? 0) > 0);
      case "losses":
        return trades.filter((t) => t.sellStatus === "filled" && (t.pnl ?? 0) <= 0);
      case "open":
        return trades.filter(
          (t) => t.buyStatus === "filled" && (t.sellStatus === "awaiting" || t.sellStatus === "pending")
        );
      default:
        return trades;
    }
  }, [trades, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortBy === "createdAt")
        diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortBy === "ticker") diff = a.ticker.localeCompare(b.ticker);
      else if (sortBy === "pnl") diff = (a.pnl ?? -Infinity) - (b.pnl ?? -Infinity);
      else if (sortBy === "returnPct")
        diff = (a.analytics?.returnPct ?? -Infinity) - (b.analytics?.returnPct ?? -Infinity);
      else if (sortBy === "actualHoldSec")
        diff = (a.analytics?.actualHoldSec ?? 0) - (b.analytics?.actualHoldSec ?? 0);
      else if (sortBy === "entryPrice")
        diff = (a.analytics?.entryPrice ?? a.buyPrice ?? 0) - (b.analytics?.entryPrice ?? b.buyPrice ?? 0);
      else if (sortBy === "relativeVolume")
        diff = (a.analytics?.relativeVolume ?? 0) - (b.analytics?.relativeVolume ?? 0);
      return asc ? diff : -diff;
    });
  }, [filtered, sortBy, asc]);

  function col(key: SortKey, label: string, extraClass = "") {
    const active = sortBy === key;
    return (
      <th
        className={`text-left text-[10px] text-muted uppercase tracking-wide pb-1.5 pt-1 px-2 cursor-pointer select-none whitespace-nowrap ${extraClass}`}
        onClick={() => {
          if (sortBy === key) setAsc((v) => !v);
          else {
            setSortBy(key);
            setAsc(false);
          }
        }}
      >
        {label}
        {active && <span className="ml-0.5 text-accent">{asc ? "↑" : "↓"}</span>}
      </th>
    );
  }

  const exportCsv = async () => {
    if (!token || exporting) return;
    setExporting(true);
    try {
      const res = await fetch("/api/analytics/export.csv", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  };

  const filterBtn = (mode: FilterMode, label: string) => (
    <button
      key={mode}
      onClick={() => setFilter(mode)}
      className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
        filter === mode ? "bg-accent text-white" : "text-muted hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="bg-panel border border-border rounded flex flex-col overflow-hidden">
      {/* Table header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          {filterBtn("all", `All (${trades.length})`)}
          {filterBtn("wins", `Wins (${trades.filter((t) => t.sellStatus === "filled" && (t.pnl ?? 0) > 0).length})`)}
          {filterBtn("losses", `Losses (${trades.filter((t) => t.sellStatus === "filled" && (t.pnl ?? 0) <= 0).length})`)}
          {filterBtn("open", `Open (${trades.filter((t) => t.buyStatus === "filled" && (t.sellStatus === "awaiting" || t.sellStatus === "pending")).length})`)}
        </div>
        <button
          onClick={exportCsv}
          disabled={exporting}
          className="text-[11px] px-2 py-0.5 rounded border border-border text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-40"
        >
          {exporting ? "…" : "↓ CSV"}
        </button>
      </div>

      {/* Scrollable table */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-panel z-10 border-b border-border">
            <tr>
              {col("createdAt", "Date / Time")}
              {col("ticker", "Ticker")}
              <th className="text-left text-[10px] text-muted uppercase tracking-wide pb-1.5 pt-1 px-2 whitespace-nowrap">
                Category
              </th>
              {col("entryPrice", "Entry $", "text-right")}
              <th className="text-right text-[10px] text-muted uppercase tracking-wide pb-1.5 pt-1 px-2 whitespace-nowrap">
                Exit $
              </th>
              {col("pnl", "P&L $", "text-right")}
              {col("returnPct", "Return %", "text-right")}
              {col("actualHoldSec", "Hold", "text-right")}
              {col("relativeVolume", "RVOL", "text-right")}
              <th className="text-left text-[10px] text-muted uppercase tracking-wide pb-1.5 pt-1 px-2">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-muted py-8">
                  No trades match this filter
                </td>
              </tr>
            ) : (
              sorted.map((t) => {
                const isComplete = t.sellStatus === "filled";
                const pnlPos = (t.pnl ?? 0) > 0;
                const retPos = (t.analytics?.returnPct ?? 0) > 0;
                const entryPrice = t.analytics?.entryPrice ?? t.buyPrice;
                const exitPrice = t.analytics?.exitPrice ?? t.sellPrice;

                return (
                  <tr
                    key={t.id}
                    className="border-t border-border hover:bg-surface transition-colors"
                  >
                    {/* Date/Time */}
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <div className="text-white">
                        {new Date(t.createdAt).toLocaleDateString("en-US", {
                          month: "2-digit",
                          day: "2-digit",
                          year: "2-digit",
                        })}
                      </div>
                      <div className="text-[10px] text-muted">
                        {new Date(t.createdAt).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "America/New_York",
                        })}{" "}
                        ET
                        {t.analytics?.isPreMarket && (
                          <span className="ml-1 text-yellow-400/80">PM</span>
                        )}
                      </div>
                    </td>

                    {/* Ticker */}
                    <td className="px-2 py-1.5">
                      <span className="text-white font-semibold">{t.ticker}</span>
                      {t.scannerId && (
                        <span className="ml-1 text-[9px] text-muted">{t.scannerId}</span>
                      )}
                    </td>

                    {/* Category */}
                    <td className="px-2 py-1.5 max-w-[160px]">
                      {t.analytics ? (
                        <span
                          className="text-white truncate block"
                          title={t.catalyst}
                        >
                          {categoryLabel(t.analytics.catalystCategory)}
                        </span>
                      ) : (
                        <span className="text-muted truncate block" title={t.catalyst}>
                          {t.catalystType}
                        </span>
                      )}
                    </td>

                    {/* Entry $ */}
                    <td className="px-2 py-1.5 text-right text-white">
                      {entryPrice != null ? `$${entryPrice.toFixed(2)}` : "—"}
                    </td>

                    {/* Exit $ */}
                    <td className="px-2 py-1.5 text-right text-white">
                      {isComplete && exitPrice != null ? `$${exitPrice.toFixed(2)}` : "—"}
                    </td>

                    {/* P&L $ */}
                    <td className={`px-2 py-1.5 text-right font-semibold ${isComplete ? (pnlPos ? "text-up" : "text-down") : "text-muted"}`}>
                      {isComplete && t.pnl != null
                        ? `${pnlPos ? "+" : ""}$${fmt2(t.pnl)}`
                        : "—"}
                    </td>

                    {/* Return % */}
                    <td className={`px-2 py-1.5 text-right font-semibold ${t.analytics?.returnPct != null ? (retPos ? "text-up" : "text-down") : "text-muted"}`}>
                      {t.analytics?.returnPct != null
                        ? `${retPos ? "+" : ""}${t.analytics.returnPct.toFixed(2)}%`
                        : "—"}
                    </td>

                    {/* Hold */}
                    <td className="px-2 py-1.5 text-right text-muted">
                      {t.analytics?.actualHoldSec != null
                        ? fmtSec(t.analytics.actualHoldSec)
                        : "—"}
                    </td>

                    {/* RVOL */}
                    <td className="px-2 py-1.5 text-right text-muted">
                      {t.analytics?.relativeVolume != null
                        ? `${t.analytics.relativeVolume.toFixed(1)}x`
                        : "—"}
                    </td>

                    {/* Status */}
                    <td className="px-2 py-1.5">{statusBadge(t)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main TradesPage ───────────────────────────────────────────────────────

export function TradesPage() {
  const token = useAuthStore((s) => s.token);
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrades = () => {
    if (!token) return;
    fetch("/api/trades/journal", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: JournalTrade[]) => {
        if (Array.isArray(data)) setTrades(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTrades();
    const interval = setInterval(loadTrades, 30_000);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <div className="h-screen w-screen flex flex-col bg-surface overflow-hidden font-mono">
      <TopNav />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-muted text-sm">Loading trades…</span>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {/* Stats row */}
          <StatsRow trades={trades} />

          {/* Chart + calendar + log */}
          <div className="p-3 flex flex-col gap-3">
            {/* Equity curve */}
            <PnlChart trades={trades} />

            {/* Calendar heatmap */}
            <CalendarHeatmap trades={trades} />

            {/* Trade log */}
            <TradeLog trades={trades} />
          </div>
        </div>
      )}
    </div>
  );
}
