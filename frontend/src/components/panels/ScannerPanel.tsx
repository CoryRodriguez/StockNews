import { useScannerStore } from "../../store/scannerStore";
import { useNewsStore } from "../../store/newsStore";
import { useDashboardStore } from "../../store/dashboardStore";
import { useAudioAlert } from "../../hooks/useAudioAlert";
import { useEffect, useRef, useState } from "react";
import { ScannerAlert } from "../../types";

type SortKey = "ticker" | "price" | "changePct" | "float" | "relativeVolume";
type SortDir = "asc" | "desc";

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function shares(n: number | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function SortIndicator({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="text-[8px] opacity-30 ml-0.5">⇅</span>;
  return <span className="text-[8px] text-accent ml-0.5">{sortDir === "asc" ? "▲" : "▼"}</span>;
}

function sortAlerts(alerts: ScannerAlert[], key: SortKey, dir: SortDir): ScannerAlert[] {
  return [...alerts].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    if (key === "ticker") {
      av = a.ticker;
      bv = b.ticker;
    } else if (key === "float") {
      av = a.float ?? -1;
      bv = b.float ?? -1;
    } else if (key === "relativeVolume") {
      av = a.relativeVolume ?? -1;
      bv = b.relativeVolume ?? -1;
    } else {
      av = a[key] as number;
      bv = b[key] as number;
    }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
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
      className="grid grid-cols-[56px_1fr_1fr_1fr_1fr] gap-x-1 px-2 py-1 hover:bg-surface cursor-pointer border-b border-border text-xs font-mono"
    >
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-white font-semibold truncate">{alert.ticker}</span>
        {alert.hasNews && <span className="w-1.5 h-1.5 rounded-full bg-up inline-block shrink-0" title="Recent news" />}
      </div>
      <span className="text-right text-white">${fmt(alert.price)}</span>
      <span className={`text-right ${isUp ? "text-up" : "text-down"}`}>
        {isUp ? "+" : ""}{fmt(alert.changePct)}%
      </span>
      <span className="text-right text-muted">{shares(alert.float)}</span>
      <span className="text-right text-muted">
        {alert.relativeVolume != null ? `${fmt(alert.relativeVolume, 1)}x` : "—"}
      </span>
    </div>
  );
}

export function ScannerPanel({ scannerId, title }: Props) {
  const alerts = useScannerStore((s) => s.alerts[scannerId] ?? []);
  const prevCountRef = useRef(0);
  const { alertScanner } = useAudioAlert();
  const setActiveTicker = useDashboardStore((s) => s.setActiveTicker);
  const setFilterTicker = useNewsStore((s) => s.setFilterTicker);

  const [sortKey, setSortKey] = useState<SortKey>("changePct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    if (alerts.length > prevCountRef.current && prevCountRef.current > 0) {
      alertScanner();
    }
    prevCountRef.current = alerts.length;
  }, [alerts.length, alertScanner]);

  const handleColClick = (col: SortKey) => {
    if (col === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
  };

  const handleRowClick = (alert: ScannerAlert) => {
    setActiveTicker(alert.ticker);
    setFilterTicker(alert.ticker);
  };

  const sorted = sortAlerts(alerts, sortKey, sortDir);

  const colClass = (col: SortKey) =>
    `cursor-pointer select-none hover:text-white transition-colors ${
      col === sortKey ? "text-accent" : "text-muted"
    }`;

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-panel shrink-0">
        <span className="text-white text-xs font-semibold">{title}</span>
        <span className="text-muted text-xs">{alerts.length}</span>
      </div>

      {/* Column headers — clickable for sorting */}
      <div className="grid grid-cols-[56px_1fr_1fr_1fr_1fr] gap-x-1 px-2 py-0.5 text-[10px] border-b border-border shrink-0">
        <span className={colClass("ticker")} onClick={() => handleColClick("ticker")}>
          Ticker<SortIndicator col="ticker" sortKey={sortKey} sortDir={sortDir} />
        </span>
        <span className={`text-right ${colClass("price")}`} onClick={() => handleColClick("price")}>
          Price<SortIndicator col="price" sortKey={sortKey} sortDir={sortDir} />
        </span>
        <span className={`text-right ${colClass("changePct")}`} onClick={() => handleColClick("changePct")}>
          Chg%<SortIndicator col="changePct" sortKey={sortKey} sortDir={sortDir} />
        </span>
        <span className={`text-right ${colClass("float")}`} onClick={() => handleColClick("float")}>
          Float<SortIndicator col="float" sortKey={sortKey} sortDir={sortDir} />
        </span>
        <span className={`text-right ${colClass("relativeVolume")}`} onClick={() => handleColClick("relativeVolume")}>
          RVol<SortIndicator col="relativeVolume" sortKey={sortKey} sortDir={sortDir} />
        </span>
      </div>

      {/* Rows */}
      <div className="overflow-y-auto flex-1">
        {sorted.length === 0 && (
          <div className="text-muted text-xs text-center py-4">No alerts</div>
        )}
        {sorted.map((alert) => (
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
