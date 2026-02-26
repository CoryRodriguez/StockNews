/**
 * News Feeds Page
 *
 * Live news feed columns (RTPR, Benzinga, Alpaca) side-by-side with
 * an embedded TradingView stock chart. Click any ticker in a headline
 * to load it in the chart.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { TopNav } from "../components/layout/TopNav";
import { useNewsStore } from "../store/newsStore";

// ── Types ──────────────────────────────────────────────────────────────────

interface FeedConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  source: string; // matches article.source from backend
  color: string;
  dotColor: string;
}

// ── Feed config ────────────────────────────────────────────────────────────

const FEEDS: FeedConfig[] = [
  {
    id: "rtpr",
    name: "RTPR.io",
    shortName: "RTPR",
    description: "Real-time press release aggregation via WebSocket.",
    source: "rtpr",
    color: "text-emerald-400",
    dotColor: "bg-emerald-400",
  },
  {
    id: "benzinga",
    name: "Benzinga",
    shortName: "BZG",
    description: "Financial news REST feed — polled every 15s.",
    source: "benzinga",
    color: "text-blue-400",
    dotColor: "bg-blue-400",
  },
  {
    id: "alpaca",
    name: "Alpaca News",
    shortName: "ALPC",
    description: "Market news via Alpaca data API — polled every 30s.",
    source: "alpaca",
    color: "text-cyan-400",
    dotColor: "bg-cyan-400",
  },
];

// ── Time helpers ───────────────────────────────────────────────────────────

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/New_York",
  });
}

// ── TradingView Chart ─────────────────────────────────────────────────────

function StockChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

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
      interval: "5",
      timezone: "America/New_York",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#161b22",
      gridColor: "#21262d",
      withdateranges: true,
      hide_side_toolbar: true,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      studies: ["STD;VWAP", "STD;Volume"],
      support_host: "https://www.tradingview.com",
    });

    container.appendChild(script);

    return () => {
      if (container) container.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div className="h-full flex flex-col bg-panel border border-border rounded overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <span className="text-white text-xs font-mono font-semibold">{symbol}</span>
        <span className="text-muted text-[10px]">TradingView</span>
        <span className="text-[9px] text-muted ml-auto italic">Click any ticker to change</span>
      </div>
      <div
        ref={containerRef}
        className="tradingview-widget-container flex-1"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}

// ── Single feed column ─────────────────────────────────────────────────────

function FeedColumn({
  feed,
  onTickerClick,
}: {
  feed: FeedConfig;
  onTickerClick: (ticker: string) => void;
}) {
  const articles = useNewsStore((s) => s.articles);

  const feedArticles = useMemo(
    () => articles.filter((a) => a.source === feed.source).slice(0, 50),
    [articles, feed.source]
  );

  return (
    <div className="flex flex-col flex-1 min-w-0 border border-border rounded bg-panel overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${feed.dotColor}`} />
            <span className={`text-xs font-semibold ${feed.color}`}>{feed.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted">{feedArticles.length} articles</span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                feedArticles.length > 0
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-600/30"
                  : "bg-surface text-muted border-border"
              }`}
            >
              {feedArticles.length > 0 ? "LIVE" : "WAITING"}
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted truncate mt-0.5">{feed.description}</p>
      </div>

      {/* Articles */}
      <div className="overflow-y-auto flex-1">
        {feedArticles.map((a, i) => (
          <div
            key={`${a.source}-${a.ticker}-${a.receivedAt}-${i}`}
            className="border-b border-border px-2.5 py-2 hover:bg-surface"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-mono text-muted shrink-0">
                {fmtTime(a.receivedAt)}
              </span>
              <button
                onClick={() => onTickerClick(a.ticker)}
                className={`text-[10px] font-semibold shrink-0 ${feed.color} hover:underline cursor-pointer`}
              >
                {a.ticker}
              </button>
              <span className="text-[9px] text-muted shrink-0">{fmtAge(a.receivedAt)}</span>
            </div>
            <p className="text-white text-[11px] leading-snug line-clamp-2">{a.title}</p>
          </div>
        ))}
        {feedArticles.length === 0 && (
          <div className="text-muted text-xs text-center py-6">
            Waiting for live articles...
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stats banner ──────────────────────────────────────────────────────────

function StatsBanner() {
  const articles = useNewsStore((s) => s.articles);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const feed of FEEDS) map[feed.source] = 0;
    for (const a of articles) {
      if (a.source && map[a.source] !== undefined) map[a.source]++;
    }
    return map;
  }, [articles]);

  return (
    <div className="flex items-center gap-6 px-4 py-2 border-b border-border bg-panel shrink-0 overflow-x-auto">
      <span className="text-muted text-[10px] uppercase tracking-wide whitespace-nowrap">
        Live Feed Stats
      </span>
      <div className="flex items-center gap-5">
        {FEEDS.map((f) => (
          <div key={f.id} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={`w-1.5 h-1.5 rounded-full ${f.dotColor}`} />
            <span className={`text-[10px] font-semibold ${f.color}`}>{f.shortName}</span>
            <span className="text-[10px] text-muted font-mono">{counts[f.source] ?? 0}</span>
          </div>
        ))}
      </div>
      <span className="text-[10px] text-muted ml-auto font-mono whitespace-nowrap">
        Total: {articles.length}
      </span>
    </div>
  );
}

// ── Main NewsFeedsPage ────────────────────────────────────────────────────

export function NewsFeedsPage() {
  const [chartSymbol, setChartSymbol] = useState("NASDAQ:SPY");

  const handleTickerClick = (ticker: string) => {
    const tvSymbol = ticker.includes(":") ? ticker : `NASDAQ:${ticker}`;
    setChartSymbol(tvSymbol);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-surface overflow-hidden font-mono">
      <TopNav />

      <StatsBanner />

      {/* Main content: feeds + chart */}
      <div className="flex-1 flex gap-2 p-3 overflow-hidden min-h-0">
        {/* Feed columns — left side */}
        <div className="flex gap-2 flex-shrink-0" style={{ width: "55%" }}>
          {FEEDS.map((feed) => (
            <FeedColumn
              key={feed.id}
              feed={feed}
              onTickerClick={handleTickerClick}
            />
          ))}
        </div>

        {/* Stock chart — right side */}
        <div className="flex-1 min-w-0">
          <StockChart symbol={chartSymbol} />
        </div>
      </div>
    </div>
  );
}
