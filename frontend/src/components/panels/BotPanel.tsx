import { useEffect, useState } from "react";
import { useBotStore, BotConfig, BotPosition, BotTrade, BotSignal } from "../../store/botStore";
import { useAuthStore } from "../../store/authStore";
import { useWatchlistStore } from "../../store/watchlistStore";

// ── Tab type ──────────────────────────────────────────────────────────────────
type BotTab = "status" | "history" | "signals" | "config";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, string> = {
  running:       "bg-green-500 text-black",
  paused:        "bg-yellow-400 text-black",
  stopped:       "bg-red-600 text-white",
  market_closed: "bg-surface text-muted border border-border",
};

function StatusBadge({ state, marketOpen }: { state: string; marketOpen: boolean }) {
  const displayState = !marketOpen && state === "running" ? "market_closed" : state;
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${STATE_COLORS[displayState] ?? "bg-surface text-muted"}`}>
      {displayState.replace("_", " ")}
    </span>
  );
}

function pdtResetDay(): string {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const daysUntilReset = day === 5 ? 3 : day === 6 ? 2 : 1;
  const reset = new Date(et);
  reset.setDate(et.getDate() + daysUntilReset);
  return reset.toLocaleDateString("en-US", { weekday: "short" });
}

const REJECT_LABELS: Record<string, string> = {
  "stale": "Stale",
  "duplicate": "Duplicate",
  "market-closed": "Mkt closed",
  "opening-auction": "Auction",
  "tier-disabled": "Tier off",
  "below-win-rate": "Low win%",
  "failed-5-pillars": "5 Pillars",
  "ai-declined": "AI declined",
  "ai-timeout": "AI timeout",
  "ai-unavailable": "AI unavail",
  "reconnect-cooldown": "Reconnect",
  "danger-pattern": "Danger",
  "bot-not-running": "Bot off",
  "already-holding": "Holding",
  "max-positions": "Max pos",
  "daily-loss-limit": "Loss limit",
  "pdt-limit": "PDT limit",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function PositionRow({ pos }: { pos: BotPosition }) {
  const prices = useWatchlistStore((s) => s.prices);
  const currentPrice = prices[pos.symbol]?.price ?? (pos.entryPrice ?? 0);
  const entry = pos.entryPrice ?? 0;
  const shares = pos.shares ?? 0;
  const unrealized = (currentPrice - entry) * shares;
  const positive = unrealized >= 0;
  return (
    <div className="px-2 py-1.5 border-b border-border text-xs font-mono hover:bg-surface">
      <div className="flex items-center justify-between">
        <span className="text-white font-semibold">{pos.symbol}</span>
        <span className={`font-semibold ${positive ? "text-up" : "text-down"}`}>
          {positive ? "+" : ""}${unrealized.toFixed(2)}
        </span>
      </div>
      <div className="flex gap-3 mt-0.5 text-muted text-[10px]">
        <span>Entry: ${entry.toFixed(2)}</span>
        <span>Now: ${currentPrice.toFixed(2)}</span>
        <span>{shares} sh</span>
        <span className="text-yellow-400">{pos.catalystType ?? "—"}</span>
      </div>
    </div>
  );
}

function BotTradeRow({ trade }: { trade: BotTrade }) {
  const pnl = trade.pnl ?? 0;
  const positive = pnl >= 0;
  return (
    <div className="px-2 py-1.5 border-b border-border text-xs font-mono hover:bg-surface">
      <div className="flex items-center justify-between">
        <span className="text-white font-semibold">{trade.symbol}</span>
        {trade.pnl != null && (
          <span className={`font-semibold ${positive ? "text-up" : "text-down"}`}>
            {positive ? "+" : ""}${pnl.toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex gap-3 mt-0.5 text-muted text-[10px]">
        <span>In: {trade.entryPrice != null ? `$${trade.entryPrice.toFixed(2)}` : "—"}</span>
        <span>Out: {trade.exitPrice != null ? `$${trade.exitPrice.toFixed(2)}` : "—"}</span>
        <span className="text-yellow-400">{trade.exitReason ?? "—"}</span>
        <span>{trade.catalystType ?? "—"}</span>
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: BotSignal }) {
  const label = signal.rejectReason
    ? (REJECT_LABELS[signal.rejectReason] ?? signal.rejectReason)
    : "rejected";
  return (
    <div className="px-2 py-1.5 border-b border-border text-xs font-mono hover:bg-surface">
      <div className="flex items-center justify-between">
        <span className="text-white font-semibold">{signal.symbol}</span>
        <span className="text-down text-[10px]">{label}</span>
      </div>
      <div className="flex gap-3 mt-0.5 text-muted text-[10px]">
        <span>{signal.catalystCategory ?? "—"}</span>
        <span>T{signal.catalystTier ?? "?"}</span>
        <span>{new Date(signal.evaluatedAt).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

// ── Config field row helper ───────────────────────────────────────────────────
function ConfigRow({
  label, value, onChange, step, min,
}: {
  label: string;
  value: number | string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1 border-b border-border">
      <span className="text-muted text-[10px] font-mono">{label}</span>
      <input
        type={typeof value === "number" ? "number" : "text"}
        value={value}
        step={step ?? 1}
        min={min ?? 0}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 bg-surface border border-border rounded px-1 py-0.5 text-[10px] font-mono text-white text-right focus:outline-none focus:border-accent"
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BotPanel() {
  const [tab, setTab] = useState<BotTab>("status");
  const [draft, setDraft] = useState<BotConfig | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const token = useAuthStore((s) => s.token);
  const {
    status, positions, trades, signals, config,
    setStatus, setPositions, setTrades, setSignals, setConfig,
  } = useBotStore();

  // ── Hydrate all data on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/bot/status",    { headers: h }).then((r) => r.json()),
      fetch("/api/bot/positions", { headers: h }).then((r) => r.json()),
      fetch("/api/bot/trades",    { headers: h }).then((r) => r.json()),
      fetch("/api/bot/signals",   { headers: h }).then((r) => r.json()),
      fetch("/api/bot/config",    { headers: h }).then((r) => r.json()),
    ]).then(([s, p, t, sig, cfg]: [
      { state?: string; error?: string } & Partial<import("../../store/botStore").BotStatus>,
      unknown,
      unknown,
      unknown,
      { error?: string } & Partial<BotConfig>,
    ]) => {
      if (s && !s.error) setStatus(s as import("../../store/botStore").BotStatus);
      if (Array.isArray(p)) setPositions(p as BotPosition[]);
      if (Array.isArray(t)) setTrades(t as BotTrade[]);
      if (Array.isArray(sig)) setSignals(sig as BotSignal[]);
      if (cfg && !cfg.error) setConfig(cfg as BotConfig);
    }).catch(() => {});
  }, [token, setStatus, setPositions, setTrades, setSignals, setConfig]);

  // ── Sync config draft from store ──────────────────────────────────────────
  useEffect(() => {
    if (config && !draft) setDraft(config);
  }, [config, draft]);

  // ── Bot control actions ───────────────────────────────────────────────────
  async function botAction(path: string) {
    if (!token) return;
    const res = await fetch(`/api/bot/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { state: string };
      if (status) {
        setStatus({ ...status, state: data.state as import("../../store/botStore").BotStatus["state"] });
      }
    }
  }

  // ── Config save ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!token || !draft) return;
    if (draft.positionSizeUsd <= 0) { setSaveError("Position size must be > 0"); return; }
    if (draft.minWinRate < 0 || draft.minWinRate > 1) { setSaveError("Win rate must be 0–1"); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/bot/config", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        const updated = (await res.json()) as BotConfig;
        setConfig(updated);
        setDraft(updated);
      } else {
        const err = (await res.json()) as { error?: string };
        setSaveError(err.error ?? "Save failed");
      }
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const state = status?.state ?? "stopped";
  const marketOpen = status?.marketOpen ?? false;

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-panel shrink-0">
        <div className="flex items-center gap-2">
          <StatusBadge state={state} marketOpen={marketOpen} />
          <span className="text-white text-xs font-semibold">Bot</span>
          {status && (
            <span className="text-[9px] text-muted font-mono">{status.mode.toUpperCase()}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {state === "running" && (
            <button
              onClick={() => void botAction("pause")}
              className="text-[10px] px-2 py-0.5 rounded border border-yellow-600/50 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 font-mono"
            >
              PAUSE
            </button>
          )}
          {state === "paused" && (
            <button
              onClick={() => void botAction("resume")}
              className="text-[10px] px-2 py-0.5 rounded border border-green-600/50 bg-green-500/10 text-up hover:bg-green-500/20 font-mono"
            >
              RESUME
            </button>
          )}
          {state === "stopped" && (
            <button
              onClick={() => void botAction("start")}
              className="text-[10px] px-2 py-0.5 rounded border border-green-600/50 bg-green-500/10 text-up hover:bg-green-500/20 font-mono"
            >
              START
            </button>
          )}
          {state !== "stopped" && (
            <button
              onClick={() => void botAction("stop")}
              className="text-[10px] px-2 py-0.5 rounded border border-red-600/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 font-mono"
            >
              STOP
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {(["status", "history", "signals", "config"] as BotTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-[10px] font-mono capitalize ${
              tab === t ? "text-accent border-b-2 border-accent" : "text-muted hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Status tab ──────────────────────────────────────────────────── */}
        {tab === "status" && (
          <div>
            {/* Stats row */}
            {status && (
              <div className="px-2 py-2 border-b border-border space-y-1">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-muted">P&amp;L Today</span>
                  <span className={status.todayRealizedPnl >= 0 ? "text-up" : "text-down"}>
                    {status.todayRealizedPnl >= 0 ? "+" : ""}${status.todayRealizedPnl.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-muted">Trades Today</span>
                  <span className="text-white">{status.todayTradeCount}</span>
                </div>
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-muted">Open Positions</span>
                  <span className="text-white">{status.openPositionCount}</span>
                </div>
                {/* PDT counter */}
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-muted">PDT</span>
                  <span>
                    <span className={status.dayTradeCount >= 3 ? "text-down" : "text-yellow-400"}>
                      {Math.min(status.dayTradeCount, 3)}/3 used
                    </span>
                    <span className="text-muted"> · </span>
                    <span className={status.dayTradeCount >= 3 ? "text-down font-semibold" : "text-up"}>
                      {Math.max(0, 3 - status.dayTradeCount)} left
                    </span>
                    <span className="text-muted"> (resets {pdtResetDay()})</span>
                  </span>
                </div>
              </div>
            )}

            {/* Open positions */}
            <div className="px-2 py-1 border-b border-border">
              <span className="text-[9px] text-muted font-mono uppercase tracking-wide">Open Positions</span>
            </div>
            {positions.length === 0 ? (
              <div className="text-muted text-[10px] text-center py-3 font-mono">No open positions</div>
            ) : (
              positions.map((p) => <PositionRow key={p.id} pos={p} />)
            )}
          </div>
        )}

        {/* ── History tab ─────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div>
            {trades.length === 0 ? (
              <div className="text-muted text-[10px] text-center py-3 font-mono">No completed bot trades yet</div>
            ) : (
              trades.map((t) => <BotTradeRow key={t.id} trade={t} />)
            )}
          </div>
        )}

        {/* ── Signals tab ─────────────────────────────────────────────────── */}
        {tab === "signals" && (
          <div>
            {signals.length === 0 ? (
              <div className="text-muted text-[10px] text-center py-3 font-mono">No rejected signals yet</div>
            ) : (
              signals.map((s) => <SignalRow key={s.id} signal={s} />)
            )}
          </div>
        )}

        {/* ── Config tab ──────────────────────────────────────────────────── */}
        {tab === "config" && (
          <div>
            {!draft ? (
              <div className="text-muted text-[10px] text-center py-3 font-mono">Loading config…</div>
            ) : (
              <>
                <div className="px-2 py-1 border-b border-border">
                  <span className="text-[9px] text-muted font-mono uppercase tracking-wide">Bot Configuration</span>
                </div>

                <ConfigRow label="Catalyst Tiers (e.g. 1,2,3,4)" value={draft.enabledCatalystTiers}
                  onChange={(v) => setDraft({ ...draft, enabledCatalystTiers: v })} />
                <ConfigRow label="Position Size ($)" value={draft.positionSizeUsd} step={10} min={1}
                  onChange={(v) => setDraft({ ...draft, positionSizeUsd: parseFloat(v) || 0 })} />
                <ConfigRow label="Max Concurrent Positions" value={draft.maxConcurrentPositions} min={1}
                  onChange={(v) => setDraft({ ...draft, maxConcurrentPositions: parseInt(v) || 1 })} />
                <ConfigRow label="Daily Loss Limit ($)" value={draft.dailyLossLimitUsd} step={50} min={0}
                  onChange={(v) => setDraft({ ...draft, dailyLossLimitUsd: parseFloat(v) || 0 })} />
                <ConfigRow label="Min Win Rate (0–1)" value={draft.minWinRate} step={0.05} min={0}
                  onChange={(v) => setDraft({ ...draft, minWinRate: parseFloat(v) || 0 })} />
                <ConfigRow label="Hard Stop Loss (%)" value={draft.hardStopLossPct} step={0.5} min={0}
                  onChange={(v) => setDraft({ ...draft, hardStopLossPct: parseFloat(v) || 0 })} />
                <ConfigRow label="Profit Target (%)" value={draft.profitTargetPct} step={1} min={0}
                  onChange={(v) => setDraft({ ...draft, profitTargetPct: parseFloat(v) || 0 })} />
                <ConfigRow label="Trailing Stop (% from peak)" value={draft.trailingStopPct} step={0.5} min={0}
                  onChange={(v) => setDraft({ ...draft, trailingStopPct: parseFloat(v) || 0 })} />
                <ConfigRow label="Trailing Stop ($)" value={draft.trailingStopDollar} step={0.25} min={0}
                  onChange={(v) => setDraft({ ...draft, trailingStopDollar: parseFloat(v) || 0 })} />
                <ConfigRow label="Max Hold (sec)" value={draft.maxHoldDurationSec} step={30} min={30}
                  onChange={(v) => setDraft({ ...draft, maxHoldDurationSec: parseInt(v) || 300 })} />
                <ConfigRow label="Max Float (shares)" value={draft.maxFloatShares} step={1000000} min={0}
                  onChange={(v) => setDraft({ ...draft, maxFloatShares: parseInt(v) || 0 })} />
                <ConfigRow label="Max Share Price ($)" value={draft.maxSharePrice} step={1} min={0}
                  onChange={(v) => setDraft({ ...draft, maxSharePrice: parseFloat(v) || 0 })} />
                <ConfigRow label="Min Relative Volume" value={draft.minRelativeVolume} step={0.5} min={0}
                  onChange={(v) => setDraft({ ...draft, minRelativeVolume: parseFloat(v) || 0 })} />
                <ConfigRow label="Confidence High (multiplier)" value={draft.confidenceMultiplierHigh} step={0.5} min={0}
                  onChange={(v) => setDraft({ ...draft, confidenceMultiplierHigh: parseFloat(v) || 1 })} />
                <ConfigRow label="Confidence Med (multiplier)" value={draft.confidenceMultiplierMed} step={0.5} min={0}
                  onChange={(v) => setDraft({ ...draft, confidenceMultiplierMed: parseFloat(v) || 1 })} />
                <ConfigRow label="Confidence Low (multiplier)" value={draft.confidenceMultiplierLow} step={0.5} min={0}
                  onChange={(v) => setDraft({ ...draft, confidenceMultiplierLow: parseFloat(v) || 0.5 })} />
                <ConfigRow label="Stars 3 size ($)" value={draft.tradeSizeStars3} step={10} min={0}
                  onChange={(v) => setDraft({ ...draft, tradeSizeStars3: parseFloat(v) || 0 })} />
                <ConfigRow label="Stars 4 size ($)" value={draft.tradeSizeStars4} step={10} min={0}
                  onChange={(v) => setDraft({ ...draft, tradeSizeStars4: parseFloat(v) || 0 })} />
                <ConfigRow label="Stars 5 size ($)" value={draft.tradeSizeStars5} step={10} min={0}
                  onChange={(v) => setDraft({ ...draft, tradeSizeStars5: parseFloat(v) || 0 })} />

                {saveError && (
                  <div className="px-2 py-1 text-[10px] text-down font-mono">{saveError}</div>
                )}

                <div className="px-2 py-2">
                  <button
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="w-full text-[10px] font-mono py-1.5 rounded border border-accent/50 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save Config"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
