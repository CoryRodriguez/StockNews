import { useScannerStore } from "../../store/scannerStore";
import { useNewsStore } from "../../store/newsStore";
import { useDashboardStore } from "../../store/dashboardStore";
import { useAudioAlert } from "../../hooks/useAudioAlert";
import { useEffect, useRef } from "react";
import { ScannerAlert } from "../../types";

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function vol(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

interface Props {
  scannerId: string;
  title: string;
}

function AlertRow({ alert, onClick }: { alert: ScannerAlert; onClick: () => void }) {
  const isUp = alert.changePct >= 0;
  return (
    <div
      onClick={onClick}
      className="grid grid-cols-[60px_1fr_1fr_1fr] gap-x-2 px-2 py-1 hover:bg-surface cursor-pointer border-b border-border text-xs font-mono"
    >
      <div className="flex items-center gap-1">
        <span className="text-white font-semibold">{alert.ticker}</span>
        {alert.hasNews && <span className="w-1.5 h-1.5 rounded-full bg-up inline-block" title="Recent news" />}
      </div>
      <span className="text-right text-white">${fmt(alert.price)}</span>
      <span className={`text-right ${isUp ? "text-up" : "text-down"}`}>
        {isUp ? "+" : ""}{fmt(alert.changePct)}%
      </span>
      <span className="text-right text-muted">{vol(alert.volume)}</span>
    </div>
  );
}

export function ScannerPanel({ scannerId, title }: Props) {
  const alerts = useScannerStore((s) => s.alerts[scannerId] ?? []);
  const prevCountRef = useRef(0);
  const { alertScanner } = useAudioAlert();
  const setActiveTicker = useDashboardStore((s) => s.setActiveTicker);
  const setFilterTicker = useNewsStore((s) => s.setFilterTicker);

  // Play alert sound when new rows arrive
  useEffect(() => {
    if (alerts.length > prevCountRef.current && prevCountRef.current > 0) {
      alertScanner();
    }
    prevCountRef.current = alerts.length;
  }, [alerts.length, alertScanner]);

  const handleRowClick = (alert: ScannerAlert) => {
    setActiveTicker(alert.ticker);
    setFilterTicker(alert.ticker);
  };

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-panel shrink-0">
        <span className="text-white text-xs font-semibold">{title}</span>
        <span className="text-muted text-xs">{alerts.length}</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[60px_1fr_1fr_1fr] gap-x-2 px-2 py-0.5 text-[10px] text-muted border-b border-border shrink-0">
        <span>Ticker</span>
        <span className="text-right">Price</span>
        <span className="text-right">Chg%</span>
        <span className="text-right">Volume</span>
      </div>

      {/* Rows */}
      <div className="overflow-y-auto flex-1">
        {alerts.length === 0 && (
          <div className="text-muted text-xs text-center py-4">No alerts</div>
        )}
        {alerts.map((alert) => (
          <AlertRow
            key={`${alert.ticker}-${alert.alertedAt}`}
            alert={alert}
            onClick={() => handleRowClick(alert)}
          />
        ))}
      </div>
    </div>
  );
}
