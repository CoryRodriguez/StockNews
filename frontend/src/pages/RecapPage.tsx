import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceDot,
} from "recharts";
import { TopNav } from "../components/layout/TopNav";
import type { RecapData } from "../store/recapStore";

// ---- Constants ----

const CHART_COLORS = {
  profit: "#22c55e",
  loss: "#ef4444",
  grid: "#2d2d2d",
  axis: "#6b7280",
  entry: "#60a5fa",
  exit: "#f59e0b",
};

const DARK_TOOLTIP_STYLE = {
  contentStyle: {
    background: "#1a1a1a",
    border: "1px solid #333",
    fontSize: 10,
  },
};

const AXIS_TICK = { fill: "#6b7280", fontSize: 10 };

// ---- Types ----

type ViewMode = "day" | "week" | "month";

interface HistoryRow {
  date: string;
  totalPnl: number;
  tradeCount: number;
  winCount: number;
  winRate: number;
  score: number;
  signalCount: number;
  firedCount: number;
  bestTradePnl: number | null;
  worstTradePnl: number | null;
  spyChangePct: number | null;
  qqqChangePct: number | null;
}

// ---- Utilities ----

function getTodayET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function pnlClass(val: number | null): string {
  if (val == null) return "text-muted";
  return val >= 0 ? "text-green-400" : "text-red-400";
}

function fmtPnl(val: number | null): string {
  if (val == null) return "—";
  const abs = Math.abs(val).toFixed(2);
  return val >= 0 ? `+$${abs}` : `-$${abs}`;
}

function fmtPct(val: number | null): string {
  if (val == null) return "—";
  return `${(val * 100).toFixed(1)}%`;
}

function fmtNum(val: number | null): string {
  if (val == null) return "—";
  return val.toFixed(2);
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

function dayLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    return d.toLocaleDateString("en-US", { weekday: "short" });
  } catch {
    return dateStr;
  }
}

// ---- Sub-components ----

interface TrendIndicatorProps {
  current: number;
  previous: number | null | undefined;
  label: string;
  format?: "pct" | "dollar";
}

function TrendIndicator({ current, previous, label, format = "dollar" }: TrendIndicatorProps) {
  if (previous == null) return null;
  const delta = current - previous;
  const pctDelta = previous !== 0 ? (delta / Math.abs(previous)) * 100 : 0;
  const isUp = delta >= 0;
  const arrow = isUp ? "▲" : "▼";
  const colorClass = isUp ? "text-green-400" : "text-red-400";
  const displayVal =
    format === "pct"
      ? `${Math.abs(pctDelta).toFixed(0)}%`
      : `$${Math.abs(delta).toFixed(2)}`;
  return (
    <span className={`text-xs ${colorClass}`}>
      {arrow} {displayVal} vs prev {label}
    </span>
  );
}

interface SectionHeaderProps {
  title: string;
  sectionKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
}

function SectionHeader({ title, sectionKey, expanded, onToggle }: SectionHeaderProps) {
  return (
    <button
      onClick={() => onToggle(sectionKey)}
      className="w-full flex items-center justify-between px-4 py-2 bg-bg-secondary border border-border rounded text-sm font-semibold text-fg hover:bg-bg text-left"
    >
      <span>{title}</span>
      <span className="text-muted text-xs">{expanded ? "▲ Collapse" : "▼ Expand"}</span>
    </button>
  );
}

// ---- Loading / Error states ----

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-40">
      <span className="text-muted text-sm font-mono">Loading recap…</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32">
      <span className="text-muted text-sm">{message}</span>
    </div>
  );
}

// ---- Day View Sub-components ----

function SummaryCard({ recap }: { recap: RecapData }) {
  const s = recap.summary;
  const scoreColor =
    s.score >= 80 ? "text-green-400" : s.score >= 50 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="bg-bg-secondary border border-border rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className={`text-3xl font-bold font-mono ${pnlClass(s.totalPnl)}`}>
            {fmtPnl(s.totalPnl)}
          </div>
          <div className="text-xs text-muted mt-0.5">{s.date}</div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${scoreColor}`}>{s.score}</div>
          <div className="text-xs text-muted">Score</div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 text-center">
        <div>
          <div className="text-xs text-muted">Trades</div>
          <div className="text-sm font-semibold text-fg">{s.tradeCount}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Win Rate</div>
          <div className="text-sm font-semibold text-fg">{fmtPct(s.winRate)}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Best</div>
          <div className={`text-sm font-semibold ${pnlClass(s.bestTradePnl)}`}>
            {fmtPnl(s.bestTradePnl)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Worst</div>
          <div className={`text-sm font-semibold ${pnlClass(s.worstTradePnl)}`}>
            {fmtPnl(s.worstTradePnl)}
          </div>
        </div>
      </div>
    </div>
  );
}

function BenchmarksCard({ recap }: { recap: RecapData }) {
  const b = recap.benchmarks;
  const s = recap.summary;
  return (
    <div className="bg-bg-secondary border border-border rounded p-4">
      <div className="text-xs font-semibold text-muted mb-2">Benchmarks</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted mb-1">vs Market</div>
          <div className="flex gap-4 text-sm">
            <span>
              <span className="text-muted text-xs">SPY </span>
              <span className={pnlClass(b.spyChangePct)}>
                {b.spyChangePct != null ? `${b.spyChangePct > 0 ? "+" : ""}${b.spyChangePct.toFixed(2)}%` : "—"}
              </span>
            </span>
            <span>
              <span className="text-muted text-xs">QQQ </span>
              <span className={pnlClass(b.qqqChangePct)}>
                {b.qqqChangePct != null ? `${b.qqqChangePct > 0 ? "+" : ""}${b.qqqChangePct.toFixed(2)}%` : "—"}
              </span>
            </span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted mb-1">vs Self</div>
          <div className="flex gap-4 text-sm">
            {b.selfAvg5d && (
              <span>
                <span className="text-muted text-xs">5d avg </span>
                <TrendIndicator current={s.totalPnl} previous={b.selfAvg5d.pnl} label="5d avg" />
              </span>
            )}
            {b.selfAvg30d && (
              <span>
                <span className="text-muted text-xs">30d avg </span>
                <TrendIndicator current={s.totalPnl} previous={b.selfAvg30d.pnl} label="30d avg" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function IntradayChart({ recap }: { recap: RecapData }) {
  const trades = recap.sections.trades;

  let cumPnl = 0;
  const timelinePoints = trades.map((t) => {
    cumPnl += t.pnl ?? 0;
    return {
      time: fmtTime((t as Record<string, string | null | undefined>).exitTime ?? null),
      pnl: parseFloat(cumPnl.toFixed(2)),
      symbol: t.symbol,
    };
  });

  if (timelinePoints.length === 0) {
    return <EmptyState message="No trades to display timeline" />;
  }

  return (
    <div className="bg-bg-secondary border border-border rounded p-4">
      <div className="text-xs font-semibold text-muted mb-2">Intraday P&amp;L Timeline</div>
      <div className="w-full h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timelinePoints} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              {...DARK_TOOLTIP_STYLE}
              formatter={(val: number | undefined) => [fmtPnl(val ?? null), "Cumulative P&L"]}
            />
            <Line
              type="monotone"
              dataKey="pnl"
              stroke={cumPnl >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss}
              strokeWidth={2}
              dot={false}
            />
            {timelinePoints.map((pt, idx) => (
              <ReferenceDot
                key={idx}
                x={pt.time}
                y={pt.pnl}
                r={4}
                fill={CHART_COLORS.exit}
                stroke="none"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TradeBreakdownSection({ recap }: { recap: RecapData }) {
  const trades = recap.sections.trades;
  if (trades.length === 0) {
    return <EmptyState message="No trades for this day" />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-border text-muted">
            <th className="text-left py-1 pr-3">Symbol</th>
            <th className="text-left py-1 pr-3">Catalyst</th>
            <th className="text-right py-1 pr-3">Entry</th>
            <th className="text-right py-1 pr-3">Exit</th>
            <th className="text-right py-1 pr-3">P&amp;L</th>
            <th className="text-left py-1 pr-3">Exit Reason</th>
            <th className="text-right py-1 pr-3">Hold (m)</th>
            <th className="text-right py-1 pr-3">VWAP Dev</th>
            <th className="text-right py-1 pr-3">Peak</th>
            <th className="text-right py-1">Max DD%</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={i} className="border-b border-border/30 hover:bg-bg/30">
              <td className="py-1 pr-3 font-semibold text-fg">{t.symbol}</td>
              <td className="py-1 pr-3 text-muted">{t.catalystType ?? "—"}</td>
              <td className="py-1 pr-3 text-right">{t.entryPrice != null ? `$${t.entryPrice.toFixed(2)}` : "—"}</td>
              <td className="py-1 pr-3 text-right">{t.exitPrice != null ? `$${t.exitPrice.toFixed(2)}` : "—"}</td>
              <td className={`py-1 pr-3 text-right ${pnlClass(t.pnl)}`}>{fmtPnl(t.pnl)}</td>
              <td className="py-1 pr-3 text-muted">{t.exitReason ?? "—"}</td>
              <td className="py-1 pr-3 text-right">{t.holdMinutes != null ? t.holdMinutes.toFixed(1) : "—"}</td>
              <td className="py-1 pr-3 text-right">{t.entryVwapDev != null ? `${t.entryVwapDev.toFixed(2)}%` : "—"}</td>
              <td className="py-1 pr-3 text-right">{t.peakPrice != null ? `$${t.peakPrice.toFixed(2)}` : "—"}</td>
              <td className={`py-1 text-right ${t.maxDrawdownPct != null ? "text-red-400" : "text-muted"}`}>
                {t.maxDrawdownPct != null ? `${t.maxDrawdownPct.toFixed(2)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignalRejectionSection({ recap }: { recap: RecapData }) {
  const signals = recap.sections.signals;
  const histEntries = Object.entries(signals.rejectionHistogram || {}).sort((a, b) => b[1] - a[1]);
  const histData = histEntries.map(([reason, count]) => ({ reason, count }));
  const maxCount = histData.length > 0 ? Math.max(...histData.map((d) => d.count)) : 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-xs text-muted">Evaluated</div>
          <div className="text-sm font-semibold text-fg">{signals.totalEvaluated}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Fired</div>
          <div className="text-sm font-semibold text-green-400">{signals.totalFired}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Rejected</div>
          <div className="text-sm font-semibold text-red-400">{signals.totalRejected}</div>
        </div>
      </div>

      {histData.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-2">Rejection Reasons</div>
          <div className="w-full" style={{ height: Math.max(80, histData.length * 24) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={histData}
                layout="vertical"
                margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="reason"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip {...DARK_TOOLTIP_STYLE} />
                <Bar dataKey="count" fill={CHART_COLORS.entry} radius={[0, 2, 2, 0]}>
                  {histData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        histData[i].count === maxCount ? CHART_COLORS.exit : CHART_COLORS.entry
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {signals.missedOpportunities.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted mb-2">
            Missed Opportunities ({signals.missedOpportunities.length})
          </div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="text-left py-1 pr-3">Symbol</th>
                <th className="text-left py-1 pr-3">Headline</th>
                <th className="text-left py-1 pr-3">Reason</th>
                <th className="text-right py-1">Peak Move</th>
              </tr>
            </thead>
            <tbody>
              {signals.missedOpportunities.map((mo, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-bg/30">
                  <td className="py-1 pr-3 font-semibold text-fg">{mo.symbol}</td>
                  <td className="py-1 pr-3 text-muted max-w-xs truncate">{mo.headline}</td>
                  <td className="py-1 pr-3 text-muted">{mo.rejectReason}</td>
                  <td className="py-1 text-right text-green-400">
                    +{(mo.postRejectPeakPct * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CatalystPerformanceSection({ recap }: { recap: RecapData }) {
  const catalysts = recap.sections.catalysts;
  if (catalysts.length === 0) {
    return <EmptyState message="No catalyst performance data" />;
  }
  return (
    <table className="w-full text-xs font-mono">
      <thead>
        <tr className="border-b border-border text-muted">
          <th className="text-left py-1 pr-3">Category</th>
          <th className="text-right py-1 pr-3">Trades</th>
          <th className="text-right py-1 pr-3">Wins</th>
          <th className="text-right py-1 pr-3">Win Rate</th>
          <th className="text-right py-1">P&amp;L</th>
        </tr>
      </thead>
      <tbody>
        {catalysts.map((c, i) => {
          const isAllWin = c.tradeCount > 0 && c.winCount === c.tradeCount;
          return (
            <tr
              key={i}
              className={`border-b border-border/30 hover:bg-bg/30 ${isAllWin ? "bg-green-900/10" : ""}`}
            >
              <td className="py-1 pr-3 text-fg font-semibold">{c.category}</td>
              <td className="py-1 pr-3 text-right">{c.tradeCount}</td>
              <td className="py-1 pr-3 text-right">{c.winCount}</td>
              <td className={`py-1 pr-3 text-right ${isAllWin ? "text-green-400" : "text-fg"}`}>
                {fmtPct(c.winRate)}
              </td>
              <td className={`py-1 text-right ${pnlClass(c.totalPnl)}`}>{fmtPnl(c.totalPnl)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StrategyAdherenceSection({ recap }: { recap: RecapData }) {
  const adherence = recap.sections.adherence;
  const distEntries = Object.entries(adherence.exitReasonDistribution || {}).sort(
    (a, b) => b[1] - a[1]
  );
  const totalExits = distEntries.reduce((sum, [, v]) => sum + v, 0) || 1;

  function adherenceLabelClass(label: string): string {
    if (label === "on-target") return "text-green-400";
    if (label === "early-exit") return "text-yellow-400";
    if (label === "overhold") return "text-red-400";
    return "text-muted";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-fg">
          Adherence: {adherence.adherencePct.toFixed(0)}%
        </span>
        <span className="text-xs text-muted">exits matched recommended strategy</span>
      </div>

      {distEntries.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-2">Exit Reason Distribution</div>
          <div className="space-y-1">
            {distEntries.map(([reason, count]) => (
              <div key={reason} className="flex items-center gap-2 text-xs">
                <span className="text-muted w-28 shrink-0 truncate">{reason}</span>
                <div className="flex-1 bg-bg rounded h-3 overflow-hidden">
                  <div
                    className="h-3 bg-blue-600 rounded"
                    style={{ width: `${(count / totalExits) * 100}%` }}
                  />
                </div>
                <span className="text-fg w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {adherence.trades.length > 0 && (
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="text-left py-1 pr-3">Symbol</th>
              <th className="text-left py-1 pr-3">Catalyst</th>
              <th className="text-right py-1 pr-3">Rec. Hold (m)</th>
              <th className="text-right py-1 pr-3">Actual Hold (m)</th>
              <th className="text-right py-1">Adherence</th>
            </tr>
          </thead>
          <tbody>
            {adherence.trades.map((t, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-bg/30">
                <td className="py-1 pr-3 text-fg font-semibold">{t.symbol}</td>
                <td className="py-1 pr-3 text-muted">{t.catalystType ?? "—"}</td>
                <td className="py-1 pr-3 text-right">
                  {t.recommendedHoldSec != null ? (t.recommendedHoldSec / 60).toFixed(1) : "—"}
                </td>
                <td className="py-1 pr-3 text-right">
                  {t.actualHoldSec != null ? (t.actualHoldSec / 60).toFixed(1) : "—"}
                </td>
                <td className={`py-1 text-right ${adherenceLabelClass(t.adherenceLabel)}`}>
                  {t.adherenceLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SuggestionsCard({ suggestions }: { suggestions: string[] }) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div className="bg-bg-secondary border border-border rounded p-4">
      <div className="text-xs font-semibold text-muted mb-2">Suggestions</div>
      <ul className="space-y-1">
        {suggestions.map((s, i) => (
          <li key={i} className="text-sm text-fg flex items-start gap-2">
            <span className="text-blue-400 shrink-0">•</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Day View ----

function DayView({ recap, loading }: { recap: RecapData | null; loading: boolean }) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = useCallback((s: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        next.delete(s);
      } else {
        next.add(s);
      }
      return next;
    });
  }, []);

  if (loading) return <LoadingState />;
  if (!recap) return <EmptyState message="No recap data for this date" />;

  return (
    <div className="space-y-3">
      <SummaryCard recap={recap} />
      <BenchmarksCard recap={recap} />
      <IntradayChart recap={recap} />

      <div className="space-y-2">
        <SectionHeader
          title="Trade-by-Trade Breakdown"
          sectionKey="trades"
          expanded={expandedSections.has("trades")}
          onToggle={toggleSection}
        />
        {expandedSections.has("trades") && (
          <div className="bg-bg-secondary border border-border rounded p-4">
            <TradeBreakdownSection recap={recap} />
          </div>
        )}

        <SectionHeader
          title="Signal Rejection Analysis"
          sectionKey="signals"
          expanded={expandedSections.has("signals")}
          onToggle={toggleSection}
        />
        {expandedSections.has("signals") && (
          <div className="bg-bg-secondary border border-border rounded p-4">
            <SignalRejectionSection recap={recap} />
          </div>
        )}

        <SectionHeader
          title="Catalyst Performance"
          sectionKey="catalysts"
          expanded={expandedSections.has("catalysts")}
          onToggle={toggleSection}
        />
        {expandedSections.has("catalysts") && (
          <div className="bg-bg-secondary border border-border rounded p-4">
            <CatalystPerformanceSection recap={recap} />
          </div>
        )}

        <SectionHeader
          title="Strategy Adherence"
          sectionKey="adherence"
          expanded={expandedSections.has("adherence")}
          onToggle={toggleSection}
        />
        {expandedSections.has("adherence") && (
          <div className="bg-bg-secondary border border-border rounded p-4">
            <StrategyAdherenceSection recap={recap} />
          </div>
        )}
      </div>

      <SuggestionsCard suggestions={recap.sections.suggestions} />
    </div>
  );
}

// ---- Week View ----

function WeekView({
  rows,
  loading,
  prevRows,
}: {
  rows: HistoryRow[];
  loading: boolean;
  prevRows: HistoryRow[];
}) {
  if (loading) return <LoadingState />;
  if (rows.length === 0) return <EmptyState message="No data for this week" />;

  const chartData = rows.map((r) => ({
    day: dayLabel(r.date),
    pnl: r.totalPnl,
  }));

  const weekTotal = rows.reduce((sum, r) => sum + r.totalPnl, 0);
  const weekTradeCount = rows.reduce((sum, r) => sum + r.tradeCount, 0);
  const prevWeekTotal =
    prevRows.length > 0 ? prevRows.reduce((sum, r) => sum + r.totalPnl, 0) : null;

  return (
    <div className="space-y-4">
      <div className="bg-bg-secondary border border-border rounded p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted">Weekly P&amp;L</span>
          <TrendIndicator current={weekTotal} previous={prevWeekTotal} label="week" />
        </div>
        <div className="w-full h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                {...DARK_TOOLTIP_STYLE}
                formatter={(val: number | undefined) => [fmtPnl(val ?? null), "P&L"]}
              />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.pnl >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-bg-secondary border border-border rounded p-4">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="text-left py-1 pr-3">Date</th>
              <th className="text-right py-1 pr-3">P&amp;L</th>
              <th className="text-right py-1 pr-3">Trades</th>
              <th className="text-right py-1 pr-3">Win Rate</th>
              <th className="text-right py-1">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-bg/30">
                <td className="py-1 pr-3 text-fg">
                  {dayLabel(r.date)} {r.date}
                </td>
                <td className={`py-1 pr-3 text-right ${pnlClass(r.totalPnl)}`}>{fmtPnl(r.totalPnl)}</td>
                <td className="py-1 pr-3 text-right text-fg">{r.tradeCount}</td>
                <td className="py-1 pr-3 text-right text-fg">{fmtPct(r.winRate)}</td>
                <td className="py-1 text-right text-fg">{r.score}</td>
              </tr>
            ))}
            <tr className="border-t border-border font-semibold">
              <td className="py-1 pr-3 text-muted">Week Total</td>
              <td className={`py-1 pr-3 text-right ${pnlClass(weekTotal)}`}>{fmtPnl(weekTotal)}</td>
              <td className="py-1 pr-3 text-right text-fg">{weekTradeCount}</td>
              <td className="py-1 pr-3 text-right text-muted">—</td>
              <td className="py-1 text-right text-muted">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Month View ----

interface WeekGroup {
  label: string;
  rows: HistoryRow[];
  totalPnl: number;
  tradeCount: number;
  avgWinRate: number;
}

function groupByWeek(rows: HistoryRow[]): WeekGroup[] {
  const weeks: Map<string, HistoryRow[]> = new Map();
  for (const row of rows) {
    const d = new Date(row.date + "T12:00:00Z");
    const day = d.getUTCDay(); // 0=Sun
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d);
    monday.setUTCDate(diff);
    const key = monday.toISOString().slice(0, 10);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(row);
  }
  return Array.from(weeks.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, wRows]) => {
      const totalPnl = wRows.reduce((s, r) => s + r.totalPnl, 0);
      const tradeCount = wRows.reduce((s, r) => s + r.tradeCount, 0);
      const avgWinRate =
        wRows.filter((r) => r.tradeCount > 0).reduce((s, r) => s + r.winRate, 0) /
        (wRows.filter((r) => r.tradeCount > 0).length || 1);
      return {
        label: `Wk ${key}`,
        rows: wRows,
        totalPnl,
        tradeCount,
        avgWinRate,
      };
    });
}

function MonthView({
  rows,
  loading,
  prevRows,
}: {
  rows: HistoryRow[];
  loading: boolean;
  prevRows: HistoryRow[];
}) {
  if (loading) return <LoadingState />;
  if (rows.length === 0) return <EmptyState message="No data for this month" />;

  const weeks = groupByWeek(rows);
  const chartData = weeks.map((w) => ({ label: w.label, pnl: w.totalPnl }));
  const monthTotal = rows.reduce((sum, r) => sum + r.totalPnl, 0);
  const monthTradeCount = rows.reduce((sum, r) => sum + r.tradeCount, 0);
  const prevMonthTotal =
    prevRows.length > 0 ? prevRows.reduce((sum, r) => sum + r.totalPnl, 0) : null;

  return (
    <div className="space-y-4">
      <div className="bg-bg-secondary border border-border rounded p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted">Monthly P&amp;L by Week</span>
          <TrendIndicator current={monthTotal} previous={prevMonthTotal} label="month" />
        </div>
        <div className="w-full h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                {...DARK_TOOLTIP_STYLE}
                formatter={(val: number | undefined) => [fmtPnl(val ?? null), "Weekly P&L"]}
              />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.pnl >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-bg-secondary border border-border rounded p-4">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="text-left py-1 pr-3">Week</th>
              <th className="text-right py-1 pr-3">P&amp;L</th>
              <th className="text-right py-1 pr-3">Trades</th>
              <th className="text-right py-1">Avg Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-bg/30">
                <td className="py-1 pr-3 text-fg">{w.label}</td>
                <td className={`py-1 pr-3 text-right ${pnlClass(w.totalPnl)}`}>{fmtPnl(w.totalPnl)}</td>
                <td className="py-1 pr-3 text-right text-fg">{w.tradeCount}</td>
                <td className="py-1 text-right text-fg">{fmtPct(w.avgWinRate)}</td>
              </tr>
            ))}
            <tr className="border-t border-border font-semibold">
              <td className="py-1 pr-3 text-muted">Month Total</td>
              <td className={`py-1 pr-3 text-right ${pnlClass(monthTotal)}`}>{fmtPnl(monthTotal)}</td>
              <td className="py-1 pr-3 text-right text-fg">{monthTradeCount}</td>
              <td className="py-1 text-right text-muted">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Main RecapPage ----

export default function RecapPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [anchorDate, setAnchorDate] = useState(getTodayET());
  const [dayRecap, setDayRecap] = useState<RecapData | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [prevPeriodRows, setPrevPeriodRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Helper to normalize a raw API row (persisted DailyRecap) or computed RecapData
  function normalizeRecapData(raw: Record<string, unknown>): RecapData {
    // If the raw object already has sections, it's a full RecapData
    if (raw.sections) {
      return raw as unknown as RecapData;
    }
    // Otherwise it's a persisted DailyRecap row — wrap minimal summary
    const summary = raw as unknown as RecapData["summary"];
    return {
      date: summary.date ?? String(raw.date ?? ""),
      summary,
      sections: {
        trades: [],
        signals: {
          rejectionHistogram: {},
          missedOpportunities: [],
          totalEvaluated: 0,
          totalFired: 0,
          totalRejected: 0,
        },
        catalysts: [],
        adherence: {
          exitReasonDistribution: {},
          trades: [],
          adherencePct: 0,
        },
        suggestions: [],
      },
      benchmarks: {
        spyChangePct: null,
        qqqChangePct: null,
        selfAvg5d: null,
        selfAvg30d: null,
      },
    };
  }

  // Fetch previous period anchor date
  function getPrevAnchor(mode: ViewMode, anchor: string): string {
    const d = new Date(anchor + "T12:00:00Z");
    if (mode === "week") {
      d.setUTCDate(d.getUTCDate() - 7);
    } else {
      d.setUTCMonth(d.getUTCMonth() - 1);
    }
    return d.toISOString().slice(0, 10);
  }

  useEffect(() => {
    setLoading(true);
    if (viewMode === "day") {
      fetch(`/api/bot/recap?date=${anchorDate}`)
        .then((r) => r.json())
        .then((data) => {
          if (data && !data.error) {
            setDayRecap(normalizeRecapData(data as Record<string, unknown>));
          } else {
            setDayRecap(null);
          }
        })
        .catch(() => setDayRecap(null))
        .finally(() => setLoading(false));
    } else {
      const prevAnchor = getPrevAnchor(viewMode, anchorDate);
      Promise.all([
        fetch(`/api/bot/recap/history?mode=${viewMode}&anchor=${anchorDate}`).then((r) => r.json()),
        fetch(`/api/bot/recap/history?mode=${viewMode}&anchor=${prevAnchor}`).then((r) => r.json()),
      ])
        .then(([current, prev]) => {
          setHistoryRows(Array.isArray(current) ? current : []);
          setPrevPeriodRows(Array.isArray(prev) ? prev : []);
        })
        .catch(() => {
          setHistoryRows([]);
          setPrevPeriodRows([]);
        })
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, anchorDate]);

  return (
    <div className="h-screen w-screen flex flex-col bg-bg overflow-hidden font-mono">
      <TopNav />
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-bg-secondary shrink-0">
        <h1 className="text-lg font-bold text-fg">Daily Recap</h1>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            className="bg-bg border border-border rounded px-2 py-1 text-sm text-fg"
          />
          <div className="flex gap-1">
            {(["day", "week", "month"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-2 py-1 text-xs rounded ${
                  viewMode === m
                    ? "bg-blue-600 text-white"
                    : "bg-bg text-muted hover:text-fg"
                }`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full">
        {viewMode === "day" && <DayView recap={dayRecap} loading={loading} />}
        {viewMode === "week" && (
          <WeekView rows={historyRows} loading={loading} prevRows={prevPeriodRows} />
        )}
        {viewMode === "month" && (
          <MonthView rows={historyRows} loading={loading} prevRows={prevPeriodRows} />
        )}
      </div>
    </div>
  );
}
