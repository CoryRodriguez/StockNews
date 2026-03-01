import { useEffect, useRef } from "react";
import { useDashboardStore } from "../../store/dashboardStore";

interface Props {
  panelId: string;
  symbol: string;
}

// TradingView timeframe buttons
const TIMEFRAMES = ["10S", "30S", "1", "5", "15", "60", "D"];
const TF_LABELS: Record<string, string> = {
  "10S": "10s", "30S": "30s", "1": "1m", "5": "5m", "15": "15m", "60": "1h", "D": "1D",
};

export function ChartPanel({ panelId, symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const updatePanelSymbol = useDashboardStore((s) => s.updatePanelSymbol);
  const activeTicker = useDashboardStore((s) => s.activeTicker);

  // When the dashboard's active ticker changes, update this chart's symbol
  useEffect(() => {
    if (activeTicker) {
      // Resolve to a formatted TV symbol — default to NASDAQ prefix
      const tvSymbol = activeTicker.includes(":") ? activeTicker : `NASDAQ:${activeTicker}`;
      updatePanelSymbol(panelId, tvSymbol);
    }
  }, [activeTicker, panelId, updatePanelSymbol]);

  // Re-embed TradingView widget whenever symbol changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = "";
    if (scriptRef.current) {
      scriptRef.current.remove();
      scriptRef.current = null;
    }

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.cssText = "height:100%;width:100%;";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "60",
      timezone: "America/New_York",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#161b22",
      gridColor: "#21262d",
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      studies: ["STD;VWAP", "STD;EMA@tv-basicstudies", "STD;Volume"],
      support_host: "https://www.tradingview.com",
    });

    container.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (container) container.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      {/* Minimal header showing current symbol */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border shrink-0">
        <span className="text-white text-xs font-mono font-semibold">{symbol}</span>
        <span className="text-muted text-[10px]">TradingView</span>
      </div>
      <div
        ref={containerRef}
        className="tradingview-widget-container flex-1"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
