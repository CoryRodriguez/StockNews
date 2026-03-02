import { useEffect } from "react";
import { TopNav } from "../components/layout/TopNav";
import { useBotStore, BotTrade } from "../store/botStore";
import { useAuthStore } from "../store/authStore";

function BotTradeRow({ trade }: { trade: BotTrade }) {
  const pnl = trade.pnl ?? 0;
  const positive = pnl >= 0;
  return (
    <tr className="border-b border-border/30 hover:bg-surface/50 text-xs font-mono">
      <td className="py-2 px-3 text-white font-semibold">{trade.symbol}</td>
      <td className="py-2 px-3 text-muted">
        {trade.entryAt
          ? new Date(trade.entryAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })
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
              timeZone: "America/New_York",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—"}
      </td>
    </tr>
  );
}

export function HistoryPage() {
  const token = useAuthStore((s) => s.token);
  const { trades, setTrades } = useBotStore();

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

  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const wins = trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses = trades.filter((t) => (t.pnl ?? 0) < 0).length;

  return (
    <div className="h-screen w-screen flex flex-col bg-surface overflow-hidden font-mono">
      <TopNav />
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-6xl mx-auto">
          {/* Summary bar */}
          <div className="flex items-center gap-6 mb-4 px-1">
            <h1 className="text-lg font-bold text-white">Trade History</h1>
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

          {/* Table */}
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
        </div>
      </div>
    </div>
  );
}
