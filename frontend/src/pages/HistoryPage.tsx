import { useEffect, useCallback, useState } from "react";
import { TopNav } from "../components/layout/TopNav";
import { useBotStore, BotTrade } from "../store/botStore";
import { useAuthStore } from "../store/authStore";
import {
  useLabelStore,
  CATALYST_CATEGORIES,
  type FullSignal,
  type HeadlineLabel,
  type LabelStats,
} from "../store/labelStore";

// ── Tab type ─────────────────────────────────────────────────────────────────

type Tab = "trades" | "signals";

// ── Trades Tab (extracted from original HistoryPage) ─────────────────────────

function BotTradeRow({ trade }: { trade: BotTrade }) {
  const pnl = trade.pnl ?? 0;
  const positive = pnl >= 0;
  return (
    <tr className="border-b border-border/30 hover:bg-surface/50 text-xs font-mono">
      <td className="py-2 px-3 text-white font-semibold">{trade.symbol}</td>
      <td className="py-2 px-3 text-muted">
        {trade.entryAt
          ? new Date(trade.entryAt).toLocaleDateString("en-US", { timeZone: "America/Chicago" })
          : "—"}
      </td>
      <td className="py-2 px-3 text-right">
        {trade.entryPrice != null ? `$${trade.entryPrice.toFixed(2)}` : "—"}
      </td>
      <td className="py-2 px-3 text-right">
        {trade.exitPrice != null ? `$${trade.exitPrice.toFixed(2)}` : "—"}
      </td>
      <td className="py-2 px-3 text-right">{trade.shares ?? "—"}</td>
      <td className={`py-2 px-3 text-right font-semibold ${positive ? "text-up" : "text-down"}`}>
        {trade.pnl != null ? `${positive ? "+" : ""}$${pnl.toFixed(2)}` : "—"}
      </td>
      <td className="py-2 px-3 text-yellow-400">{trade.exitReason ?? "—"}</td>
      <td className="py-2 px-3 text-muted">{trade.catalystType ?? "—"}</td>
      <td className="py-2 px-3 text-muted">
        {trade.entryAt
          ? new Date(trade.entryAt).toLocaleTimeString("en-US", {
              timeZone: "America/Chicago",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—"}
      </td>
    </tr>
  );
}

function TradesTab() {
  const trades = useBotStore((s) => s.trades);
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const wins = trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses = trades.filter((t) => (t.pnl ?? 0) < 0).length;

  return (
    <>
      <div className="flex items-center gap-6 mb-4 px-1">
        <div className="flex items-center gap-4 text-xs ml-auto">
          <span className="text-muted">
            {trades.length} trade{trades.length !== 1 ? "s" : ""}
          </span>
          <span className="text-muted">
            {wins}W / {losses}L
          </span>
          <span className={totalPnl >= 0 ? "text-up font-semibold" : "text-down font-semibold"}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </span>
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="text-muted text-sm text-center py-12">No completed bot trades yet</div>
      ) : (
        <div className="border border-border rounded overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-panel text-muted text-[10px] font-mono uppercase tracking-wide">
                <th className="text-left py-2 px-3">Symbol</th>
                <th className="text-left py-2 px-3">Date</th>
                <th className="text-right py-2 px-3">Entry</th>
                <th className="text-right py-2 px-3">Exit</th>
                <th className="text-right py-2 px-3">Shares</th>
                <th className="text-right py-2 px-3">P&L</th>
                <th className="text-left py-2 px-3">Exit Reason</th>
                <th className="text-left py-2 px-3">Catalyst</th>
                <th className="text-left py-2 px-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <BotTradeRow key={t.id} trade={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Label Stats Bar ──────────────────────────────────────────────────────────

function LabelStatsBar({ stats }: { stats: LabelStats | null }) {
  if (!stats) return null;
  const { labeledCount, totalSignals, labeledPct } = stats;
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <span>
        {labeledCount}/{totalSignals} labeled
      </span>
      <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${labeledPct}%` }}
        />
      </div>
      <span>{labeledPct}%</span>
    </div>
  );
}

// ── Signal Row ───────────────────────────────────────────────────────────────

function SignalRow({
  signal,
  selected,
  onClick,
}: {
  signal: FullSignal;
  selected: boolean;
  onClick: () => void;
}) {
  const outcomeColor =
    signal.outcome === "fired"
      ? "text-up"
      : signal.outcome === "rejected"
      ? "text-down"
      : "text-yellow-400";

  return (
    <tr
      onClick={onClick}
      className={`border-b border-border/30 text-xs font-mono cursor-pointer transition-colors ${
        selected ? "bg-blue-500/10" : "hover:bg-surface/50"
      }`}
    >
      <td className="py-2 px-3 text-white font-semibold">{signal.symbol}</td>
      <td className="py-2 px-3 text-muted max-w-[300px] truncate">{signal.headline}</td>
      <td className={`py-2 px-3 ${outcomeColor}`}>{signal.outcome}</td>
      <td className="py-2 px-3 text-muted">{signal.catalystCategory ?? "—"}</td>
      <td className="py-2 px-3 text-muted">{signal.catalystTier ?? "—"}</td>
      <td className="py-2 px-3 text-muted">{signal.source}</td>
      <td className="py-2 px-3 text-muted">
        {new Date(signal.evaluatedAt).toLocaleTimeString("en-US", {
          timeZone: "America/Chicago",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </td>
      <td className="py-2 px-3 text-center">
        {signal.label ? (
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Labeled" />
        ) : (
          <span className="inline-block w-2 h-2 rounded-full bg-border" title="Unlabeled" />
        )}
      </td>
    </tr>
  );
}

// ── Signal Detail Panel ──────────────────────────────────────────────────────

function SignalDetailPanel({
  signal,
  token,
  onClose,
  onLabelSaved,
}: {
  signal: FullSignal;
  token: string;
  onClose: () => void;
  onLabelSaved: (signalId: string, label: HeadlineLabel) => void;
}) {
  const [category, setCategory] = useState(signal.label?.overrideCategory ?? "");
  const [tier, setTier] = useState(signal.label?.overrideTier?.toString() ?? "");
  const [notes, setNotes] = useState(signal.label?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [error, setError] = useState("");

  // Reset form when signal changes
  useEffect(() => {
    setCategory(signal.label?.overrideCategory ?? "");
    setTier(signal.label?.overrideTier?.toString() ?? "");
    setNotes(signal.label?.notes ?? "");
    setError("");
  }, [signal.id, signal.label]);

  // Escape key closes panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {};
      if (category) body.overrideCategory = category;
      if (tier) body.overrideTier = parseInt(tier);
      if (notes) body.notes = notes;

      const res = await fetch(`/api/labels/${signal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      const label = (await res.json()) as HeadlineLabel;
      onLabelSaved(signal.id, label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReclassify = async () => {
    setReclassifying(true);
    setError("");
    try {
      const res = await fetch(`/api/labels/${signal.id}/reclassify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Reclassify failed");
      const label = (await res.json()) as HeadlineLabel;
      onLabelSaved(signal.id, label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reclassify failed");
    } finally {
      setReclassifying(false);
    }
  };

  const outcomeColor =
    signal.outcome === "fired"
      ? "text-up"
      : signal.outcome === "rejected"
      ? "text-down"
      : "text-yellow-400";

  const sectionClass = "mb-4";
  const labelClass = "text-[10px] uppercase tracking-wide text-muted mb-1";
  const valueClass = "text-xs text-white";

  return (
    <div className="w-96 border-l border-border bg-panel flex flex-col overflow-y-auto shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-white">{signal.symbol}</span>
        <button onClick={onClose} className="text-muted hover:text-white text-xs">
          ESC
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        {/* Headline */}
        <div className={sectionClass}>
          <div className={labelClass}>Headline</div>
          <div className={`${valueClass} leading-snug`}>{signal.headline}</div>
        </div>

        {/* Outcome + Reject Reason */}
        <div className={sectionClass}>
          <div className={labelClass}>Outcome</div>
          <div className={`text-xs font-semibold ${outcomeColor}`}>
            {signal.outcome}
            {signal.rejectReason && (
              <span className="text-muted font-normal ml-2">({signal.rejectReason})</span>
            )}
            {signal.failedPillar && (
              <span className="text-muted font-normal ml-1">[{signal.failedPillar}]</span>
            )}
          </div>
        </div>

        {/* Original Classification */}
        <div className={sectionClass}>
          <div className={labelClass}>Original Classification</div>
          <div className={valueClass}>
            {signal.catalystCategory ?? "—"} / Tier {signal.catalystTier ?? "—"}
          </div>
        </div>

        {/* AI Reasoning (from original eval) */}
        {signal.aiReasoning && (
          <div className={sectionClass}>
            <div className={labelClass}>AI Reasoning (Original)</div>
            <div className="text-xs text-muted leading-snug italic">{signal.aiReasoning}</div>
            <div className="text-[10px] text-muted mt-1">
              Proceed: {signal.aiProceed ? "Yes" : "No"} | Confidence: {signal.aiConfidence ?? "—"}
            </div>
          </div>
        )}

        {/* Market Data */}
        <div className={sectionClass}>
          <div className={labelClass}>Market Data at Eval</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted">Price</span>
            <span className="text-white">
              {signal.priceAtEval != null ? `$${signal.priceAtEval.toFixed(2)}` : "—"}
            </span>
            <span className="text-muted">Rel Volume</span>
            <span className="text-white">
              {signal.relVolAtEval != null ? `${signal.relVolAtEval.toFixed(1)}x` : "—"}
            </span>
            <span className="text-muted">Win Rate</span>
            <span className="text-white">
              {signal.winRateAtEval != null ? `${(signal.winRateAtEval * 100).toFixed(0)}%` : "—"}
            </span>
            {signal.postRejectPeakPct != null && (
              <>
                <span className="text-muted">Post-Reject Peak</span>
                <span className={signal.postRejectPeakPct > 5 ? "text-up" : "text-white"}>
                  +{signal.postRejectPeakPct.toFixed(1)}%
                </span>
              </>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Override Controls */}
        <div className={sectionClass}>
          <div className={labelClass}>Override Category</div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">— Select —</option>
            {CATALYST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className={sectionClass}>
          <div className={labelClass}>Override Tier</div>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">— Select —</option>
            {[1, 2, 3, 4, 5].map((t) => (
              <option key={t} value={t}>
                Tier {t}
              </option>
            ))}
          </select>
        </div>

        <div className={sectionClass}>
          <div className={labelClass}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional notes about this signal..."
            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-xs text-white resize-none focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* AI Reclassify Result */}
        {signal.label?.aiReclassCategory && (
          <div className={sectionClass}>
            <div className={labelClass}>AI Reclassification</div>
            <div className={valueClass}>
              {signal.label.aiReclassCategory} / Tier {signal.label.aiReclassTier ?? "—"}
            </div>
            {signal.label.aiReclassReason && (
              <div className="text-xs text-muted italic mt-1">{signal.label.aiReclassReason}</div>
            )}
          </div>
        )}

        {/* Error */}
        {error && <div className="text-xs text-red-400">{error}</div>}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-accent hover:opacity-90 disabled:opacity-50 disabled:text-muted text-white text-xs font-semibold py-2 rounded transition-colors"
          >
            {saving ? "Saving..." : "Save Label"}
          </button>
          <button
            onClick={handleReclassify}
            disabled={reclassifying}
            className="flex-1 bg-surface hover:bg-border text-muted hover:text-white disabled:text-muted/50 text-xs font-semibold py-2 rounded border border-border transition-colors"
          >
            {reclassifying ? "Classifying..." : "AI Re-classify"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Signals Tab ──────────────────────────────────────────────────────────────

function SignalsTab({ token }: { token: string }) {
  const {
    signals,
    stats,
    loading,
    outcomeFilter,
    selectedSignalId,
    setSignals,
    setStats,
    setLoading,
    setOutcomeFilter,
    setSelectedSignalId,
    updateSignalLabel,
  } = useLabelStore();

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const url = outcomeFilter
        ? `/api/bot/signals?outcome=${outcomeFilter}`
        : "/api/bot/signals";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setSignals(data as FullSignal[]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token, outcomeFilter, setSignals, setLoading]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/labels/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats((await res.json()) as LabelStats);
    } catch {
      /* ignore */
    }
  }, [token, setStats]);

  useEffect(() => {
    fetchSignals();
    fetchStats();
  }, [fetchSignals, fetchStats]);

  const selectedSignal = signals.find((s) => s.id === selectedSignalId) ?? null;

  const handleLabelSaved = useCallback(
    (signalId: string, label: HeadlineLabel) => {
      updateSignalLabel(signalId, label);
      fetchStats();
    },
    [updateSignalLabel, fetchStats]
  );

  const filterBtn = (value: string | null, label: string) => (
    <button
      onClick={() => setOutcomeFilter(value)}
      className={`text-xs px-2.5 py-1 rounded transition-colors ${
        outcomeFilter === value
          ? "text-white bg-surface"
          : "text-muted hover:text-white hover:bg-surface"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Filter bar + stats */}
        <div className="flex items-center gap-3 mb-4 px-1">
          <div className="flex items-center gap-0.5">
            {filterBtn(null, "All")}
            {filterBtn("fired", "Fired")}
            {filterBtn("rejected", "Rejected")}
          </div>
          <div className="ml-auto">
            <LabelStatsBar stats={stats} />
          </div>
        </div>

        {loading && signals.length === 0 ? (
          <div className="text-muted text-sm text-center py-12">Loading signals...</div>
        ) : signals.length === 0 ? (
          <div className="text-muted text-sm text-center py-12">No signals found</div>
        ) : (
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-panel text-muted text-[10px] font-mono uppercase tracking-wide">
                  <th className="text-left py-2 px-3">Symbol</th>
                  <th className="text-left py-2 px-3">Headline</th>
                  <th className="text-left py-2 px-3">Outcome</th>
                  <th className="text-left py-2 px-3">Category</th>
                  <th className="text-left py-2 px-3">Tier</th>
                  <th className="text-left py-2 px-3">Source</th>
                  <th className="text-left py-2 px-3">Time</th>
                  <th className="text-center py-2 px-3">Label</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <SignalRow
                    key={s.id}
                    signal={s}
                    selected={s.id === selectedSignalId}
                    onClick={() =>
                      setSelectedSignalId(s.id === selectedSignalId ? null : s.id)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedSignal && (
        <SignalDetailPanel
          signal={selectedSignal}
          token={token}
          onClose={() => setSelectedSignalId(null)}
          onLabelSaved={handleLabelSaved}
        />
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function HistoryPage() {
  const token = useAuthStore((s) => s.token);
  const { setTrades } = useBotStore();
  const [tab, setTab] = useState<Tab>("trades");

  // Fetch trades on mount (same as original)
  useEffect(() => {
    if (!token) return;
    fetch("/api/bot/trades", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTrades(data as BotTrade[]);
      })
      .catch(() => {});
  }, [token, setTrades]);

  const tabBtn = (target: Tab, label: string) => (
    <button
      onClick={() => setTab(target)}
      className={`text-xs px-3 py-1.5 rounded transition-colors ${
        tab === target
          ? "text-white bg-surface"
          : "text-muted hover:text-white hover:bg-surface"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-base overflow-hidden">
      <TopNav />
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-2 mb-4 px-1">
            <h1 className="text-lg font-bold text-white mr-4">History</h1>
            {tabBtn("trades", "Trades")}
            {tabBtn("signals", "Signals")}
          </div>

          {/* Content */}
          {tab === "trades" ? (
            <div className="flex-1 overflow-auto">
              <TradesTab />
            </div>
          ) : token ? (
            <SignalsTab token={token} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
