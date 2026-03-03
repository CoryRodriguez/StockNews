/**
 * Trades Page — Institutional Trading Desk
 *
 * Full-page trade journal combining:
 *   - Hero stat strip with dominant P&L and inline sparklines
 *   - Split panel: equity curve + calendar heatmap side by side
 *   - Enhanced trade log with colored catalyst/scanner badges and filters
 */
import { useEffect, useMemo, useRef, useState } from "react";
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

const ACRONYMS = new Set(["FDA", "MA", "CEO", "CFO", "IPO", "SEC", "DOD", "AI", "EPS", "FSD"]);

function categoryLabel(raw: string): string {
  return raw
    .split("_")
    .map((w) => {
      const upper = w.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function toDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Catalyst & Scanner Badge Colors ───────────────────────────────────────

const CATALYST_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  EARNINGS_BEAT:       { bg: "rgba(46,160,67,0.12)",  text: "#5cda6f", border: "rgba(46,160,67,0.25)" },
  FDA_APPROVAL:        { bg: "rgba(56,189,193,0.12)", text: "#56c4c8", border: "rgba(56,189,193,0.25)" },
  CLINICAL_TRIAL:      { bg: "rgba(163,113,247,0.12)",text: "#a371f7", border: "rgba(163,113,247,0.25)" },
  MA_ACQUISITION:      { bg: "rgba(199,147,22,0.12)", text: "#d4a843", border: "rgba(199,147,22,0.25)" },
  CONTRACT_WIN:        { bg: "rgba(76,141,202,0.12)", text: "#6da9d6", border: "rgba(76,141,202,0.25)" },
  REGULATORY_APPROVAL: { bg: "rgba(46,160,100,0.12)", text: "#4dc98a", border: "rgba(46,160,100,0.25)" },
  GUIDANCE_RAISE:      { bg: "rgba(130,194,40,0.12)", text: "#93c83e", border: "rgba(130,194,40,0.25)" },
  PARTNERSHIP:         { bg: "rgba(99,102,241,0.12)", text: "#818cf8", border: "rgba(99,102,241,0.25)" },
  TREASURY_STRATEGY:   { bg: "rgba(234,138,46,0.12)", text: "#ea8a2e", border: "rgba(234,138,46,0.25)" },
};

const SCANNER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  news_flow: { bg: "rgba(76,141,202,0.12)", text: "#6da9d6", border: "rgba(76,141,202,0.25)" },
  gap_up:    { bg: "rgba(234,138,46,0.12)", text: "#ea8a2e", border: "rgba(234,138,46,0.25)" },
};

const DEFAULT_BADGE = { bg: "rgba(99,110,123,0.12)", text: "#636e7b", border: "rgba(99,110,123,0.25)" };

function CatalystBadge({ category }: { category: string }) {
  const colors = CATALYST_COLORS[category] ?? DEFAULT_BADGE;
  return (
    <span
      className="text-[11px] font-mono px-1.5 py-[2px] rounded-sm whitespace-nowrap inline-block leading-tight"
      style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
    >
      {categoryLabel(category)}
    </span>
  );
}

function ScannerBadge({ scanner }: { scanner: string }) {
  const colors = SCANNER_COLORS[scanner] ?? DEFAULT_BADGE;
  const label = scanner === "news_flow" ? "NEWS" : scanner === "gap_up" ? "GAP" : scanner.toUpperCase();
  return (
    <span
      className="text-[10px] font-mono font-semibold px-1.5 py-[2px] rounded-sm whitespace-nowrap inline-block leading-tight uppercase tracking-wider"
      style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
    >
      {label}
    </span>
  );
}

// ── Dummy P&L data (shown when no real trades exist) ──────────────────────
// Covers Feb–Mar 2026 so the calendar heatmap is populated for the current month

const DUMMY_PNL_TRADES: { date: string; pnl: number }[] = [
  // February 2026
  { date: "2026-02-02", pnl: 75.30 },  { date: "2026-02-03", pnl: -38.90 },
  { date: "2026-02-04", pnl: 148.60 }, { date: "2026-02-05", pnl: 55.20 },
  { date: "2026-02-06", pnl: -72.40 }, { date: "2026-02-09", pnl: 118.50 },
  { date: "2026-02-10", pnl: 42.80 },  { date: "2026-02-11", pnl: -28.60 },
  { date: "2026-02-12", pnl: 165.30 }, { date: "2026-02-13", pnl: 88.70 },
  { date: "2026-02-17", pnl: -95.40 }, { date: "2026-02-18", pnl: 112.20 },
  { date: "2026-02-19", pnl: 78.50 },  { date: "2026-02-20", pnl: -45.30 },
  { date: "2026-02-23", pnl: 155.80 }, { date: "2026-02-24", pnl: 92.40 },
  { date: "2026-02-25", pnl: -33.10 }, { date: "2026-02-26", pnl: 67.80 },
  { date: "2026-02-27", pnl: 128.90 },
  // March 2026
  { date: "2026-03-02", pnl: 84.50 },  { date: "2026-03-03", pnl: -41.20 },
  { date: "2026-03-04", pnl: 176.30 }, { date: "2026-03-05", pnl: -62.80 },
  { date: "2026-03-06", pnl: 98.40 },  { date: "2026-03-09", pnl: 52.70 },
  { date: "2026-03-10", pnl: -88.50 }, { date: "2026-03-11", pnl: 134.20 },
  { date: "2026-03-12", pnl: 45.90 },  { date: "2026-03-13", pnl: -29.60 },
  { date: "2026-03-16", pnl: 187.40 }, { date: "2026-03-17", pnl: -55.10 },
  { date: "2026-03-18", pnl: 92.30 },  { date: "2026-03-19", pnl: 68.70 },
  { date: "2026-03-20", pnl: -74.20 }, { date: "2026-03-23", pnl: 142.50 },
  { date: "2026-03-24", pnl: 38.90 },  { date: "2026-03-25", pnl: -22.40 },
  { date: "2026-03-26", pnl: 115.60 }, { date: "2026-03-27", pnl: 78.30 },
  { date: "2026-03-30", pnl: -48.70 }, { date: "2026-03-31", pnl: 156.80 },
];

// ── Dummy full journal trades (all sections use these when no real trades) ─

const _DUMMY_TEMPLATES = [
  { ticker: "NVDA",  cat: "EARNINGS_BEAT",        entry: 485.20, catalyst: "NVIDIA Q4 Rev $22.1B Beats $20.5B Est; Data Center +206%",            type: "tier3", scanner: "news_flow", pre: false },
  { ticker: "TSLA",  cat: "REGULATORY_APPROVAL",  entry: 252.40, catalyst: "Tesla FSD receives NHTSA approval for 12-state expansion",             type: "tier2", scanner: "news_flow", pre: false },
  { ticker: "AAPL",  cat: "MA_ACQUISITION",        entry: 188.50, catalyst: "Apple in talks to acquire AI startup Cohere for $1.2B — WSJ",          type: "tier1", scanner: "gap_up",    pre: true  },
  { ticker: "BIIB",  cat: "FDA_APPROVAL",          entry: 285.30, catalyst: "FDA grants accelerated approval for Biogen ALZ-303 treatment",         type: "tier2", scanner: "news_flow", pre: false },
  { ticker: "MRNA",  cat: "CLINICAL_TRIAL",        entry:  88.60, catalyst: "Moderna Phase 3 mRNA-4157 cancer vaccine 44% recurrence reduction",    type: "tier2", scanner: "gap_up",    pre: false },
  { ticker: "AMZN",  cat: "CONTRACT_WIN",          entry: 182.40, catalyst: "Amazon wins $3.9B DoD JEDI Phase II cloud services contract",          type: "tier4", scanner: "news_flow", pre: true  },
  { ticker: "META",  cat: "EARNINGS_BEAT",         entry: 498.80, catalyst: "Meta Q4 EPS $8.02 vs $6.77 Est; ad revenue up 21% YoY",               type: "tier3", scanner: "news_flow", pre: false },
  { ticker: "GME",   cat: "TREASURY_STRATEGY",     entry:  22.50, catalyst: "GameStop announces $1B Bitcoin treasury reserve strategy",             type: "tier1", scanner: "gap_up",    pre: false },
  { ticker: "SMCI",  cat: "GUIDANCE_RAISE",        entry:  48.20, catalyst: "Super Micro raises FY2026 revenue guidance to $26-30B",               type: "tier3", scanner: "news_flow", pre: false },
  { ticker: "GOOGL", cat: "MA_ACQUISITION",        entry: 172.30, catalyst: "Alphabet acquires cloud security firm Wiz for $23B — Bloomberg",      type: "tier1", scanner: "news_flow", pre: true  },
  { ticker: "ABBV",  cat: "FDA_APPROVAL",          entry: 164.80, catalyst: "AbbVie receives FDA approval for Skyrizi extended-release formulation",type: "tier2", scanner: "news_flow", pre: false },
  { ticker: "PLTR",  cat: "CONTRACT_WIN",          entry:  28.40, catalyst: "Palantir secures $480M DoD AI analytics contract extension",           type: "tier4", scanner: "gap_up",    pre: true  },
  { ticker: "IONQ",  cat: "PARTNERSHIP",           entry:  18.70, catalyst: "IonQ partners with AWS to offer commercial quantum computing services", type: "tier3", scanner: "news_flow", pre: false },
  { ticker: "CRWD",  cat: "EARNINGS_BEAT",         entry: 312.50, catalyst: "CrowdStrike Q3 ARR $3.44B vs $3.28B Est; raised FY2025 guidance",     type: "tier3", scanner: "news_flow", pre: false },
  { ticker: "RKLB",  cat: "CONTRACT_WIN",          entry:  22.80, catalyst: "Rocket Lab awarded $515M DoD satellite launch contract",               type: "tier4", scanner: "gap_up",    pre: false },
];

const _HOLD_TIMES = [
  38, 52, 65, 82, 95, 124, 147, 165, 198, 245, 285, 55,
  48, 71, 115, 88, 143, 185, 225, 270, 98, 62, 175, 235,
  155, 210, 75, 130, 190, 250, 40, 85, 160, 220, 300,
  45, 78, 102, 132, 168, 205, 58,
];

const DUMMY_JOURNAL_TRADES: JournalTrade[] = DUMMY_PNL_TRADES.map((d, i) => {
  const tmpl = _DUMMY_TEMPLATES[i % _DUMMY_TEMPLATES.length];
  const qty = 10;
  const entryPrice = tmpl.entry;
  const exitPrice = +(entryPrice + d.pnl / qty).toFixed(2);
  const returnPct = +((exitPrice - entryPrice) / entryPrice * 100).toFixed(2);
  const holdSec = _HOLD_TIMES[i % _HOLD_TIMES.length];
  const [yr, mo, dy] = d.date.split("-").map(Number);
  const hour = tmpl.pre ? 8 : 9 + (i % 4);
  const minute = (i * 17 + 5) % 60;
  const createdAt = new Date(yr, mo - 1, dy, hour, minute, 0).toISOString();
  return {
    id: `demo-${i}`,
    ticker: tmpl.ticker,
    qty,
    buyPrice: entryPrice,
    buyStatus: "filled",
    sellPrice: exitPrice,
    sellStatus: "filled",
    catalyst: tmpl.catalyst,
    catalystType: tmpl.type as JournalTrade["catalystType"],
    scannerId: tmpl.scanner,
    pnl: d.pnl,
    createdAt,
    updatedAt: new Date(new Date(createdAt).getTime() + holdSec * 1000).toISOString(),
    analytics: {
      catalystCategory: tmpl.cat,
      catalystTier: tmpl.type === "tier1" ? 1 : tmpl.type === "tier2" ? 2 : tmpl.type === "tier3" ? 3 : 4,
      newsHeadline: tmpl.catalyst,
      tradeEnteredAt: createdAt,
      entryPrice,
      exitPrice,
      returnPct,
      actualHoldSec: holdSec,
      isPreMarket: tmpl.pre,
      relativeVolume: +(2.5 + (i % 8) * 0.8).toFixed(1),
      entryVwapDev: +((i % 2 === 0 ? 1 : -1) * (0.3 + (i % 5) * 0.45)).toFixed(2),
      peakPrice: d.pnl > 0 ? +(exitPrice * 1.003).toFixed(2) : exitPrice,
      maxDrawdownPct: +(1.1 + (i % 5) * 0.35).toFixed(2),
    },
  };
});

// ── Inline Sparkline ──────────────────────────────────────────────────────

function MiniSparkline({ values, color, width = 64, height = 20 }: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Win Rate Ring ─────────────────────────────────────────────────────────

function WinRateRing({ rate, size = 42 }: { rate: number; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const filled = circ * rate;
  const color = rate >= 0.6 ? "#2ea043" : rate >= 0.45 ? "#c79316" : "#da3633";
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#252d3a" strokeWidth="3"
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize="11" fontFamily="JetBrains Mono, monospace" fontWeight="600"
      >
        {Math.round(rate * 100)}%
      </text>
    </svg>
  );
}

// ── Hero Stat Strip ───────────────────────────────────────────────────────

function HeroStats({ trades, isDemoMode }: { trades: JournalTrade[]; isDemoMode: boolean }) {
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

  const sparkValues = useMemo(() => {
    const sorted = [...completed].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    let cum = 0;
    return sorted.map((t) => { cum += t.pnl ?? 0; return cum; });
  }, [completed]);

  const recentResults = useMemo(() => {
    return [...completed]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .reverse()
      .map((t) => (t.pnl ?? 0) > 0);
  }, [completed]);

  return (
    <div className="bg-surface border-b border-border shrink-0">
      <div className="flex items-stretch">
        {/* Dominant P&L block */}
        <div className="flex items-center gap-3 px-5 py-3 border-r border-border min-w-[240px]">
          <div className="flex flex-col">
            <span className="text-xs text-muted uppercase tracking-widest font-mono">Net P&L</span>
            <span className={`text-2xl font-mono font-bold tracking-tight ${pnlColor}`}>
              {totalPnl >= 0 ? "+" : ""}${fmt2(totalPnl)}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted font-mono">
                {completed.length} closed
              </span>
              {open.length > 0 && (
                <span className="text-xs text-accent font-mono">
                  {open.length} open
                </span>
              )}
              {isDemoMode && (
                <span className="text-[11px] font-bold px-1 py-px bg-warn/10 text-warn border border-warn/30 rounded">
                  DEMO
                </span>
              )}
            </div>
          </div>
          {sparkValues.length > 1 && (
            <MiniSparkline
              values={sparkValues}
              color={totalPnl >= 0 ? "#2ea043" : "#da3633"}
              width={72}
              height={28}
            />
          )}
        </div>

        {/* Win Rate with ring */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-r border-border">
          <WinRateRing rate={winRate} />
          <div className="flex flex-col">
            <span className="text-xs text-muted uppercase tracking-widest font-mono">Win Rate</span>
            <span className="text-[13px] text-white font-mono">
              {winners.length}W / {losers.length}L
            </span>
            {recentResults.length > 0 && (
              <div className="flex gap-0.5 mt-1">
                {recentResults.map((won, i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: won ? "#2ea043" : "#da3633" }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Avg Winner */}
        <div className="flex flex-col justify-center px-4 py-3 border-r border-border">
          <span className="text-xs text-muted uppercase tracking-widest font-mono">Avg Win</span>
          <span className="text-base text-up font-mono font-semibold">
            {winners.length > 0 ? `+$${fmt2(avgWin)}` : "—"}
          </span>
          <span className="text-xs text-muted font-mono">{winners.length} trades</span>
        </div>

        {/* Avg Loser */}
        <div className="flex flex-col justify-center px-4 py-3 border-r border-border">
          <span className="text-xs text-muted uppercase tracking-widest font-mono">Avg Loss</span>
          <span className={`text-base font-mono font-semibold ${losers.length > 0 ? "text-down" : "text-muted"}`}>
            {losers.length > 0 ? `-$${fmt2(Math.abs(avgLoss))}` : "—"}
          </span>
          <span className="text-xs text-muted font-mono">{losers.length} trades</span>
        </div>

        {/* Profit Factor with bar */}
        <div className="flex flex-col justify-center px-4 py-3 border-r border-border">
          <span className="text-xs text-muted uppercase tracking-widest font-mono">Profit Factor</span>
          <span className={`text-base font-mono font-semibold ${
            profitFactor >= 1.5 ? "text-up" : profitFactor >= 1 ? "text-warn" : "text-down"
          }`}>
            {profitFactor === Infinity ? "INF" : profitFactor > 0 ? fmt2(profitFactor) : "—"}
          </span>
          {(grossProfit > 0 || grossLoss > 0) && (
            <div className="flex h-1.5 rounded-full overflow-hidden mt-1 w-20">
              <div
                className="h-full rounded-l-full"
                style={{
                  width: `${(grossProfit / (grossProfit + grossLoss)) * 100}%`,
                  backgroundColor: "#2ea043",
                }}
              />
              <div
                className="h-full rounded-r-full"
                style={{
                  width: `${(grossLoss / (grossProfit + grossLoss)) * 100}%`,
                  backgroundColor: "#da3633",
                }}
              />
            </div>
          )}
        </div>

        {/* Total Trades */}
        <div className="flex flex-col justify-center px-4 py-3">
          <span className="text-xs text-muted uppercase tracking-widest font-mono">Total</span>
          <span className="text-base text-white font-mono font-semibold">{trades.length}</span>
          <span className="text-xs text-muted font-mono">
            {trades.length > 0 ? `${fmtSec(
              completed.reduce((s, t) => s + (t.analytics?.actualHoldSec ?? 0), 0) / Math.max(1, completed.length)
            )} avg hold` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Calendar Heatmap ─────────────────────────────────────────────────────

function CalendarHeatmap({ trades }: { trades: JournalTrade[] }) {
  const now = new Date();
  const [monthDate, setMonthDate] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1)
  );

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
    month: "short",
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

  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const monthPnl = [...dayMap.entries()]
    .filter(([k]) => k.startsWith(monthPrefix))
    .reduce((s, [, v]) => s + v.pnl, 0);
  const monthTrades = [...dayMap.entries()]
    .filter(([k]) => k.startsWith(monthPrefix))
    .reduce((s, [, v]) => s + v.count, 0);

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDayOfWeek).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const weekSummary = (days: (number | null)[]) => {
    let pnl = 0, count = 0;
    for (const d of days) {
      if (d == null) continue;
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const data = dayMap.get(key);
      if (data) { pnl += data.pnl; count += data.count; }
    }
    return { pnl, count };
  };

  const renderDay = (day: number | null, wi: number, di: number) => {
    if (day == null) return <div key={`e-${wi}-${di}`} />;
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayData = dayMap.get(dateKey);
    const isToday = dateKey === todayKey;
    let bgStyle: React.CSSProperties | undefined;
    if (dayData) {
      const intensity = Math.min(0.85, 0.18 + 0.67 * (Math.abs(dayData.pnl) / maxAbsPnl));
      bgStyle = {
        backgroundColor:
          dayData.pnl >= 0
            ? `rgba(46, 160, 67, ${intensity})`
            : `rgba(218, 54, 51, ${intensity})`,
      };
    }
    return (
      <div
        key={day}
        className={`relative rounded p-1 border flex flex-col transition-all duration-150 hover:scale-105 hover:z-10 ${
          isToday ? "border-accent ring-1 ring-accent/30" : "border-border"
        } ${!dayData ? "bg-surface" : ""}`}
        style={{ ...bgStyle, minHeight: "40px" }}
        title={dayData ? `$${dayData.pnl >= 0 ? "+" : ""}${dayData.pnl.toFixed(2)} (${dayData.count} trade${dayData.count !== 1 ? "s" : ""})` : undefined}
      >
        <span className={`text-[11px] font-mono leading-none ${isToday ? "text-accent font-bold" : "text-white/50"}`}>
          {day}
        </span>
        {dayData && (
          <div className="mt-auto">
            <div className="text-xs font-mono font-semibold text-white leading-none">
              {dayData.pnl >= 0 ? "+" : ""}{dayData.pnl.toFixed(0)}
            </div>
            <div className="text-[10px] text-white/60 leading-none mt-px">{dayData.count}t</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-panel border border-border rounded-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="text-muted hover:text-white text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-surface transition-colors"
          >
            ‹
          </button>
          <span className="text-white text-sm font-semibold font-mono w-24 text-center">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="text-muted hover:text-white text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-surface transition-colors"
          >
            ›
          </button>
        </div>
        {monthTrades > 0 && (
          <span className={`text-[13px] font-mono font-semibold ${monthPnl >= 0 ? "text-up" : "text-down"}`}>
            {monthPnl >= 0 ? "+" : ""}${monthPnl.toFixed(2)}
            <span className="text-muted font-normal ml-1 text-xs">{monthTrades}t</span>
          </span>
        )}
      </div>

      {/* Calendar grid */}
      <div className="px-3 py-2 flex flex-col flex-1">
        {/* Day-of-week headers */}
        <div className="flex gap-1 mb-1">
          <div className="grid grid-cols-7 gap-1 flex-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="text-center text-[11px] text-muted font-mono py-0.5">{d}</div>
            ))}
          </div>
          <div className="w-16 shrink-0 text-right text-[11px] text-muted font-mono py-0.5 pr-1">Wk</div>
        </div>

        {/* Week rows */}
        <div className="flex flex-col gap-1">
          {weeks.map((wk, wi) => {
            const { pnl, count } = weekSummary(wk);
            return (
              <div key={wi} className="flex gap-1 items-stretch">
                <div className="grid grid-cols-7 gap-1 flex-1">
                  {wk.map((day, di) => renderDay(day, wi, di))}
                </div>
                <div className="w-16 shrink-0 flex flex-col items-end justify-center bg-surface border border-border rounded px-1.5 py-0.5">
                  {count > 0 ? (
                    <>
                      <span className={`text-xs font-mono font-semibold leading-none ${pnl >= 0 ? "text-up" : "text-down"}`}>
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
                      </span>
                      <span className="text-[10px] text-muted mt-0.5">{count}t</span>
                    </>
                  ) : (
                    <span className="text-[9px] text-muted">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-2 justify-center">
          <span className="text-[10px] text-muted font-mono">LOSS</span>
          <div className="flex gap-px">
            {[0.85, 0.55, 0.3].map((o) => (
              <div key={o} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: `rgba(218,54,51,${o})` }} />
            ))}
            <div className="w-2.5 h-2.5 rounded-sm bg-surface border border-border" />
            {[0.3, 0.55, 0.85].map((o) => (
              <div key={o} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: `rgba(46,160,67,${o})` }} />
            ))}
          </div>
          <span className="text-[10px] text-muted font-mono">GAIN</span>
        </div>
      </div>
    </div>
  );
}

// ── P&L Equity Curve ─────────────────────────────────────────────────────

function PnlChart({ trades, isDemoMode }: { trades: JournalTrade[]; isDemoMode?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const completed = useMemo(
    () =>
      trades
        .filter((t) => t.sellStatus === "filled" && t.pnl != null)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [trades]
  );

  const isDummy = completed.length === 0 || !!isDemoMode;

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

  const W = 800, H = 200;
  const PL = 52, PR = 16, PT = 20, PB = 28;
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
  const lineColor = isPositive ? "rgb(46,160,67)" : "rgb(218,54,51)";
  const glowColor = isPositive ? "rgba(46,160,67,0.4)" : "rgba(218,54,51,0.4)";

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.cumPnl).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${toX(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${toX(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const v = minY + (rangeY / gridCount) * i;
    return { v, y: toY(v) };
  });

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

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(toX(i) - mouseX);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    setHover({ i: closest, x: toX(closest), y: toY(points[closest].cumPnl) });
  };

  return (
    <div className="bg-panel border border-border rounded-lg flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-white text-sm font-semibold">Equity Curve</span>
        <div className="flex items-center gap-2">
          {isDummy && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 bg-warn/10 text-warn border border-warn/30 rounded font-mono">
              DEMO
            </span>
          )}
          <span className={`text-sm font-mono font-semibold ${isPositive ? "text-up" : "text-down"}`}>
            {isPositive ? "+" : ""}${finalPnl.toFixed(2)}
          </span>
          <span className="text-xs text-muted font-mono">{points.length}t</span>
        </div>
      </div>

      <div className="flex-1 px-2 py-1 min-h-0">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          className="overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridLines.map(({ v, y }) => (
            <g key={v}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              <text x={PL - 4} y={y} textAnchor="end" dominantBaseline="middle" fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="JetBrains Mono, monospace">
                {fmtY(v)}
              </text>
            </g>
          ))}

          <line x1={PL} y1={zeroY} x2={W - PR} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3,4" />
          <path d={areaPath} fill="url(#areaGrad)" />
          <path d={linePath} fill="none" stroke={glowColor} strokeWidth="4" strokeLinejoin="round" opacity="0.3" />
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />

          <circle cx={toX(peakIdx)} cy={toY(points[peakIdx].cumPnl)} r="3" fill="rgb(46,160,67)" filter="url(#glow)" />
          <text x={toX(peakIdx)} y={toY(points[peakIdx].cumPnl) - 8} textAnchor="middle" fill="rgba(46,160,67,0.9)" fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="600">
            +${points[peakIdx].cumPnl.toFixed(0)}
          </text>

          {points[troughIdx].cumPnl < 0 && (
            <>
              <circle cx={toX(troughIdx)} cy={toY(points[troughIdx].cumPnl)} r="3" fill="rgb(218,54,51)" filter="url(#glow)" />
              <text x={toX(troughIdx)} y={toY(points[troughIdx].cumPnl) + 14} textAnchor="middle" fill="rgba(218,54,51,0.9)" fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="600">
                ${points[troughIdx].cumPnl.toFixed(0)}
              </text>
            </>
          )}

          {hover && (
            <>
              <line x1={hover.x} y1={PT} x2={hover.x} y2={H - PB} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="2,2" />
              <circle cx={hover.x} cy={hover.y} r="4" fill={lineColor} stroke="white" strokeWidth="1.5" />
              <rect
                x={hover.x - 36} y={hover.y - 22} width="72" height="16" rx="3"
                fill="#151b23" stroke="#252d3a" strokeWidth="1"
              />
              <text
                x={hover.x} y={hover.y - 12}
                textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="600"
              >
                {points[hover.i].cumPnl >= 0 ? "+" : ""}${points[hover.i].cumPnl.toFixed(2)}
              </text>
            </>
          )}

          {xIndices.map((idx) => (
            <text key={idx} x={toX(idx)} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="JetBrains Mono, monospace">
              {points[idx].label}
            </text>
          ))}
        </svg>
      </div>
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
    return <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-down/10 text-down">ERR</span>;
  if (t.buyStatus === "pending")
    return <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-warn/10 text-warn">BUY</span>;
  if (t.sellStatus === "awaiting" || t.sellStatus === "pending")
    return <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent">HOLD</span>;
  if (t.sellStatus === "error")
    return <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-down/10 text-down">ERR</span>;
  return <span className="text-xs font-mono text-muted">DONE</span>;
}

function TradeLog({ trades, isDemoMode }: { trades: JournalTrade[]; isDemoMode?: boolean }) {
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [asc, setAsc] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [activeCatalysts, setActiveCatalysts] = useState<Set<string>>(new Set());
  const [activeScanners, setActiveScanners] = useState<Set<string>>(new Set());
  const [token] = [useAuthStore((s) => s.token)];
  const [exporting, setExporting] = useState(false);

  const maxAbsPnl = useMemo(() => {
    const pnls = trades.filter(t => t.pnl != null).map(t => Math.abs(t.pnl!));
    return Math.max(1, ...pnls);
  }, [trades]);

  // Collect unique catalyst categories and scanners from trades
  const { catalystCategories, scannerIds } = useMemo(() => {
    const cats = new Set<string>();
    const scanners = new Set<string>();
    for (const t of trades) {
      if (t.analytics?.catalystCategory) cats.add(t.analytics.catalystCategory);
      if (t.scannerId) scanners.add(t.scannerId);
    }
    return {
      catalystCategories: [...cats].sort(),
      scannerIds: [...scanners].sort(),
    };
  }, [trades]);

  const toggleCatalyst = (cat: string) => {
    setActiveCatalysts((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleScanner = (scanner: string) => {
    setActiveScanners((prev) => {
      const next = new Set(prev);
      if (next.has(scanner)) next.delete(scanner);
      else next.add(scanner);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = trades;

    // P&L filter
    switch (filter) {
      case "wins":
        result = result.filter((t) => t.sellStatus === "filled" && (t.pnl ?? 0) > 0);
        break;
      case "losses":
        result = result.filter((t) => t.sellStatus === "filled" && (t.pnl ?? 0) <= 0);
        break;
      case "open":
        result = result.filter(
          (t) => t.buyStatus === "filled" && (t.sellStatus === "awaiting" || t.sellStatus === "pending")
        );
        break;
    }

    // Catalyst category filter
    if (activeCatalysts.size > 0) {
      result = result.filter((t) => t.analytics?.catalystCategory && activeCatalysts.has(t.analytics.catalystCategory));
    }

    // Scanner filter
    if (activeScanners.size > 0) {
      result = result.filter((t) => t.scannerId && activeScanners.has(t.scannerId));
    }

    return result;
  }, [trades, filter, activeCatalysts, activeScanners]);

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

  function col(key: SortKey, label: string, align: "left" | "right" = "left") {
    const active = sortBy === key;
    return (
      <th
        className={`text-${align} text-[11px] text-muted uppercase tracking-wider pb-2 pt-1.5 px-2.5 cursor-pointer select-none whitespace-nowrap font-mono font-normal hover:text-white transition-colors`}
        onClick={() => {
          if (sortBy === key) setAsc((v) => !v);
          else {
            setSortBy(key);
            setAsc(false);
          }
        }}
      >
        {label}
        {active && <span className="ml-0.5 text-accent">{asc ? "▲" : "▼"}</span>}
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

  const filterBtn = (mode: FilterMode, label: string, count: number) => (
    <button
      key={mode}
      onClick={() => setFilter(mode)}
      className={`text-xs font-mono px-2.5 py-1 rounded transition-all duration-150 ${
        filter === mode
          ? "bg-accent/15 text-accent border border-accent/30"
          : "text-muted hover:text-white border border-transparent"
      }`}
    >
      {label} <span className="opacity-60">{count}</span>
    </button>
  );

  const winCount = trades.filter((t) => t.sellStatus === "filled" && (t.pnl ?? 0) > 0).length;
  const lossCount = trades.filter((t) => t.sellStatus === "filled" && (t.pnl ?? 0) <= 0).length;
  const openCount = trades.filter((t) => t.buyStatus === "filled" && (t.sellStatus === "awaiting" || t.sellStatus === "pending")).length;

  const hasActiveFilters = activeCatalysts.size > 0 || activeScanners.size > 0;

  return (
    <div className="bg-panel border border-border rounded-lg flex flex-col overflow-hidden h-full">
      {/* Primary filter bar: P&L filters + export */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          {filterBtn("all", "All", trades.length)}
          {filterBtn("wins", "Wins", winCount)}
          {filterBtn("losses", "Losses", lossCount)}
          {filterBtn("open", "Open", openCount)}
        </div>
        <div className="flex items-center gap-2">
          {isDemoMode && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 bg-warn/10 text-warn border border-warn/30 rounded font-mono">
              DEMO
            </span>
          )}
          <button
            onClick={exportCsv}
            disabled={exporting || !!isDemoMode}
            className="text-xs font-mono px-2.5 py-1 rounded border border-border text-muted hover:text-white hover:border-accent/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            title={isDemoMode ? "Export disabled in demo mode" : undefined}
          >
            {exporting ? "..." : "EXPORT CSV"}
          </button>
        </div>
      </div>

      {/* Secondary filter bar: catalyst + scanner badges */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 shrink-0 overflow-x-auto">
        {/* Scanner filters */}
        <span className="text-[10px] text-muted font-mono uppercase tracking-widest shrink-0">Source</span>
        <div className="flex items-center gap-1">
          {scannerIds.map((s) => {
            const active = activeScanners.has(s);
            const colors = SCANNER_COLORS[s] ?? DEFAULT_BADGE;
            const label = s === "news_flow" ? "NEWS" : s === "gap_up" ? "GAP" : s.toUpperCase();
            return (
              <button
                key={s}
                onClick={() => toggleScanner(s)}
                className="text-[10px] font-mono font-semibold px-1.5 py-[2px] rounded-sm uppercase tracking-wider transition-all duration-150 cursor-pointer"
                style={{
                  backgroundColor: active ? colors.bg : "transparent",
                  color: active ? colors.text : "#636e7b",
                  border: `1px solid ${active ? colors.border : "transparent"}`,
                  opacity: active ? 1 : 0.7,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="w-px h-3 bg-border mx-1 shrink-0" />

        {/* Catalyst category filters */}
        <span className="text-[10px] text-muted font-mono uppercase tracking-widest shrink-0">Catalyst</span>
        <div className="flex items-center gap-1 flex-wrap">
          {catalystCategories.map((cat) => {
            const active = activeCatalysts.has(cat);
            const colors = CATALYST_COLORS[cat] ?? DEFAULT_BADGE;
            return (
              <button
                key={cat}
                onClick={() => toggleCatalyst(cat)}
                className="text-[10px] font-mono px-1.5 py-[2px] rounded-sm whitespace-nowrap transition-all duration-150 cursor-pointer"
                style={{
                  backgroundColor: active ? colors.bg : "transparent",
                  color: active ? colors.text : "#636e7b",
                  border: `1px solid ${active ? colors.border : "transparent"}`,
                  opacity: active ? 1 : 0.7,
                }}
              >
                {categoryLabel(cat)}
              </button>
            );
          })}
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <>
            <div className="w-px h-3 bg-border mx-1 shrink-0" />
            <button
              onClick={() => { setActiveCatalysts(new Set()); setActiveScanners(new Set()); }}
              className="text-[10px] font-mono text-muted hover:text-white px-1.5 py-[2px] rounded-sm border border-border hover:border-accent/30 transition-all shrink-0"
            >
              CLEAR
            </button>
          </>
        )}
      </div>

      {/* Scrollable table */}
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full text-[13px] font-mono border-collapse">
          <thead className="sticky top-0 bg-panel z-10 border-b border-border">
            <tr>
              {col("createdAt", "Date")}
              {col("ticker", "Ticker")}
              <th className="text-left text-[11px] text-muted uppercase tracking-wider pb-2 pt-1.5 px-2.5 whitespace-nowrap font-mono font-normal">
                Source
              </th>
              <th className="text-left text-[11px] text-muted uppercase tracking-wider pb-2 pt-1.5 px-2.5 whitespace-nowrap font-mono font-normal">
                Catalyst
              </th>
              {col("entryPrice", "Entry", "right")}
              <th className="text-right text-[11px] text-muted uppercase tracking-wider pb-2 pt-1.5 px-2.5 whitespace-nowrap font-mono font-normal">
                Exit
              </th>
              {col("pnl", "P&L", "right")}
              {col("returnPct", "Ret%", "right")}
              {col("actualHoldSec", "Hold", "right")}
              {col("relativeVolume", "RVOL", "right")}
              <th className="text-center text-[11px] text-muted uppercase tracking-wider pb-2 pt-1.5 px-2.5 font-mono font-normal">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center text-muted py-12 text-xs">
                  No trades match this filter
                </td>
              </tr>
            ) : (
              sorted.map((t) => {
                const isComplete = t.sellStatus === "filled";
                const pnlVal = t.pnl ?? 0;
                const pnlPos = pnlVal > 0;
                const retPos = (t.analytics?.returnPct ?? 0) > 0;
                const entryPrice = t.analytics?.entryPrice ?? t.buyPrice;
                const exitPrice = t.analytics?.exitPrice ?? t.sellPrice;
                const pnlBarWidth = isComplete ? Math.min(100, (Math.abs(pnlVal) / maxAbsPnl) * 100) : 0;

                return (
                  <tr
                    key={t.id}
                    className="border-t border-border/50 hover:bg-surface/80 transition-colors group"
                  >
                    {/* Date/Time */}
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-0.5 h-6 rounded-full shrink-0"
                          style={{
                            backgroundColor: !isComplete ? "#4c8dca" : pnlPos ? "#2ea043" : "#da3633",
                            opacity: isComplete ? Math.max(0.3, Math.abs(pnlVal) / maxAbsPnl) : 0.5,
                          }}
                        />
                        <div>
                          <div className="text-white text-[13px]">
                            {new Date(t.createdAt).toLocaleDateString("en-US", {
                              month: "2-digit",
                              day: "2-digit",
                            })}
                          </div>
                          <div className="text-[11px] text-muted">
                            {new Date(t.createdAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "America/New_York",
                            })}
                            {t.analytics?.isPreMarket && (
                              <span className="ml-0.5 text-warn/80">PM</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Ticker */}
                    <td className="px-2.5 py-2">
                      <span className="text-white font-semibold text-sm">{t.ticker}</span>
                    </td>

                    {/* Scanner source badge */}
                    <td className="px-2.5 py-2">
                      {t.scannerId && <ScannerBadge scanner={t.scannerId} />}
                    </td>

                    {/* Catalyst category badge */}
                    <td className="px-2.5 py-2">
                      {t.analytics?.catalystCategory ? (
                        <CatalystBadge category={t.analytics.catalystCategory} />
                      ) : (
                        <span className="text-muted text-xs" title={t.catalyst}>
                          {t.catalystType}
                        </span>
                      )}
                    </td>

                    {/* Entry $ */}
                    <td className="px-2.5 py-2 text-right text-white/80">
                      {entryPrice != null ? `$${entryPrice.toFixed(2)}` : "—"}
                    </td>

                    {/* Exit $ */}
                    <td className="px-2.5 py-2 text-right text-white/80">
                      {isComplete && exitPrice != null ? `$${exitPrice.toFixed(2)}` : "—"}
                    </td>

                    {/* P&L $ with magnitude bar */}
                    <td className="px-2.5 py-2 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`font-semibold ${isComplete ? (pnlPos ? "text-up" : "text-down") : "text-muted"}`}>
                          {isComplete && t.pnl != null
                            ? `${pnlPos ? "+" : ""}$${fmt2(t.pnl)}`
                            : "—"}
                        </span>
                        {isComplete && t.pnl != null && (
                          <div className="w-full h-px rounded-full overflow-hidden bg-border">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${pnlBarWidth}%`,
                                backgroundColor: pnlPos ? "#2ea043" : "#da3633",
                                marginLeft: pnlPos ? "auto" : undefined,
                                float: pnlPos ? "right" : "left",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Return % */}
                    <td className={`px-2.5 py-2 text-right font-semibold ${t.analytics?.returnPct != null ? (retPos ? "text-up" : "text-down") : "text-muted"}`}>
                      {t.analytics?.returnPct != null
                        ? `${retPos ? "+" : ""}${t.analytics.returnPct.toFixed(2)}%`
                        : "—"}
                    </td>

                    {/* Hold */}
                    <td className="px-2.5 py-2 text-right text-muted">
                      {t.analytics?.actualHoldSec != null
                        ? fmtSec(t.analytics.actualHoldSec)
                        : "—"}
                    </td>

                    {/* RVOL */}
                    <td className="px-2.5 py-2 text-right">
                      {t.analytics?.relativeVolume != null ? (
                        <span className={t.analytics.relativeVolume >= 5 ? "text-accent" : "text-muted"}>
                          {t.analytics.relativeVolume.toFixed(1)}x
                        </span>
                      ) : "—"}
                    </td>

                    {/* Status */}
                    <td className="px-2.5 py-2 text-center">{statusBadge(t)}</td>
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
  const [apiTrades, setApiTrades] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTrades = () => {
    if (!token) return;
    fetch("/api/trades/journal", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: JournalTrade[]) => {
        if (Array.isArray(data)) setApiTrades(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTrades();
    const interval = setInterval(loadTrades, 30_000);
    return () => clearInterval(interval);
  }, [token]);

  const isDemoMode = !loading && apiTrades.length === 0;
  const displayTrades = apiTrades.length > 0 ? apiTrades : DUMMY_JOURNAL_TRADES;

  return (
    <div className="h-screen w-screen flex flex-col bg-base overflow-hidden">
      <TopNav />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <span className="text-muted text-xs font-mono">Loading trades...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Hero stat strip */}
          <HeroStats trades={displayTrades} isDemoMode={isDemoMode} />

          {/* Demo banner */}
          {isDemoMode && (
            <div className="px-4 py-1.5 bg-warn/5 border-b border-warn/20 shrink-0">
              <span className="text-warn/80 text-xs font-mono">
                DEMO DATA — no real trades recorded yet. All figures are simulated.
              </span>
            </div>
          )}

          {/* Scrollable content area */}
          <div className="flex-1 overflow-auto min-h-0">
            {/* Split panel: Chart + Calendar — both stretch to same height */}
            <div className="flex gap-3 p-3 items-stretch">
              <div className="flex-[3] min-w-0 flex">
                <div className="flex-1">
                  <PnlChart trades={displayTrades} isDemoMode={isDemoMode} />
                </div>
              </div>
              <div className="flex-[2] min-w-0 flex">
                <div className="flex-1">
                  <CalendarHeatmap trades={displayTrades} />
                </div>
              </div>
            </div>

            {/* Trade log */}
            <div className="px-3 pb-3" style={{ minHeight: "400px" }}>
              <TradeLog trades={displayTrades} isDemoMode={isDemoMode} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
