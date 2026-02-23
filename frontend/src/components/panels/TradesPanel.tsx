import { useEffect } from "react";
import { useTradesStore } from "../../store/tradesStore";
import { useAuthStore } from "../../store/authStore";
import { PaperTrade } from "../../types";

const CATALYST_STARS: Record<string, number> = {
  tier1: 5,
  tier2: 4,
  tier3: 3,
  tier4: 2,
  other: 1,
};

function Stars({ catalystType }: { catalystType: string }) {
  const count = CATALYST_STARS[catalystType] ?? 1;
  return (
    <span className="text-yellow-400 text-[10px] tracking-tight">
      {"★".repeat(count)}{"☆".repeat(5 - count)}
    </span>
  );
}

function fmt(n: number | null, decimals = 2): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function statusBadge(trade: PaperTrade) {
  if (trade.buyStatus === "error") return <span className="text-down text-[10px]">BUY ERR</span>;
  if (trade.buyStatus === "pending") return <span className="text-yellow-400 text-[10px]">BUYING</span>;
  if (trade.sellStatus === "awaiting" || trade.sellStatus === "pending")
    return <span className="text-blue-400 text-[10px]">HOLDING</span>;
  if (trade.sellStatus === "error") return <span className="text-down text-[10px]">SELL ERR</span>;
  return null; // filled — show P&L instead
}

function TradeRow({ trade }: { trade: PaperTrade }) {
  const isComplete = trade.sellStatus === "filled";
  const pnlPositive = (trade.pnl ?? 0) >= 0;

  return (
    <div className="px-2 py-1.5 border-b border-border text-xs font-mono hover:bg-surface">
      {/* Row 1: ticker + status/pnl */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-semibold">{trade.ticker}</span>
          <Stars catalystType={trade.catalystType} />
          {trade.scannerId && (
            <span className="text-[10px] text-muted">{trade.scannerId}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(trade)}
          {isComplete && trade.pnl != null && (
            <span className={`font-semibold ${pnlPositive ? "text-up" : "text-down"}`}>
              {pnlPositive ? "+" : ""}${fmt(trade.pnl)}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: prices */}
      <div className="flex gap-3 mt-0.5 text-muted text-[10px]">
        <span>
          Buy: {trade.buyPrice != null ? `$${fmt(trade.buyPrice)}` : "…"}
        </span>
        {isComplete && (
          <span>Sell: ${fmt(trade.sellPrice)}</span>
        )}
        <span>{trade.qty} sh</span>
        <span className="truncate max-w-[140px]" title={trade.catalyst}>
          {trade.catalyst}
        </span>
      </div>
    </div>
  );
}

export function TradesPanel() {
  const trades = useTradesStore((s) => s.trades);
  const setTrades = useTradesStore((s) => s.setTrades);
  const token = useAuthStore((s) => s.token);

  // Load history on mount
  useEffect(() => {
    if (!token) return;
    fetch("/api/trades", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data: PaperTrade[]) => { if (data.length) setTrades(data); })
      .catch(() => {});
  }, [token, setTrades]);

  const totalPnl = trades
    .filter((t) => t.pnl != null)
    .reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-panel shrink-0">
        <span className="text-white text-xs font-semibold">Paper Trades</span>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted">{trades.length} trades</span>
          <span className={totalPnl >= 0 ? "text-up" : "text-down"}>
            P&amp;L: {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Rows */}
      <div className="overflow-y-auto flex-1">
        {trades.length === 0 ? (
          <div className="text-muted text-xs text-center py-4">
            No trades yet — waiting for news on scanner tickers
          </div>
        ) : (
          trades.map((t) => <TradeRow key={t.id} trade={t} />)
        )}
      </div>
    </div>
  );
}
