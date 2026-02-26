/**
 * News Feeds Page
 *
 * Left: side-by-side news feed columns (RTPR, Benzinga, Dow Jones).
 * Right: TradingView chart, News Trades panel, Top Movers panel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopNav } from "../components/layout/TopNav";
import { useNewsStore } from "../store/newsStore";
import { useAuthStore } from "../store/authStore";
import { NewsArticle } from "../types";
import { highlightKeywords, deriveStars } from "../utils/newsUtils";

// ── Types ──────────────────────────────────────────────────────────────────

interface FeedArticle {
  id: string;
  ticker: string;
  title: string;
  receivedAt: string;
  source: string;
  live: boolean;
}

interface FeedConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  connected: boolean;
  configKey?: string;
  color: string;
  dotColor: string;
}

interface MoverData {
  ticker: string;
  price: number;
  changePct: number;
  volume: number;
  relativeVolume: number;
  hasNews: boolean;
  articles: { ticker: string; title: string; receivedAt: string; source?: string }[];
}

interface JournalTrade {
  id: string;
  ticker: string;
  catalyst: string;
  catalystType: string;
  buyStatus: string;
  sellStatus: string;
  createdAt: string;
  analytics?: {
    catalystCategory: string;
    newsHeadline: string;
    returnPct: number | null;
  } | null;
}

// ── Static feed config ─────────────────────────────────────────────────────

const FEEDS: FeedConfig[] = [
  {
    id: "rtpr",
    name: "RTPR.io",
    shortName: "RTPR",
    description: "Real-time press release aggregation — currently integrated.",
    connected: true,
    color: "text-emerald-400",
    dotColor: "bg-emerald-400",
  },
  {
    id: "benzinga",
    name: "Benzinga",
    shortName: "BZG",
    description: "Financial news REST feed — polled every 15s.",
    connected: true,
    color: "text-blue-400",
    dotColor: "bg-blue-400",
  },
  {
    id: "dowjones",
    name: "Dow Jones Newswires",
    shortName: "DJN",
    description: "Premium institutional-grade news wire.",
    connected: false,
    configKey: "DJ_API_KEY",
    color: "text-yellow-400",
    dotColor: "bg-yellow-400",
  },
];

// ── Demo data for unconnected feeds ──────────────────────────────────────

const STORY_BASE: { ticker: string; title: string }[] = [
  { ticker: "AAPL",  title: "Apple Announces Strategic Partnership with OpenAI for On-Device Models" },
  { ticker: "NVDA",  title: "NVIDIA Reports Record Q4 Revenue of $39.3B, Beats Estimates by 12%" },
  { ticker: "TSLA",  title: "Tesla Receives NHTSA Approval for Full Self-Driving in 12 States" },
  { ticker: "AMZN",  title: "Amazon Secures $4.7B DoD Contract, Expanding AWS GovCloud" },
  { ticker: "META",  title: "Meta Platforms Q4 EPS $8.02 vs $6.77 Est; Revenue Up 21% YoY" },
  { ticker: "BIIB",  title: "Biogen FDA Accelerated Approval Granted for ALZ-303 Alzheimer Treatment" },
  { ticker: "MRNA",  title: "Moderna Phase 3 mRNA-4157 Cancer Vaccine Shows 44% Reduction in Recurrence" },
  { ticker: "GOOGL", title: "Alphabet to Acquire Cloud Security Firm Wiz for $23B — WSJ" },
  { ticker: "MSFT",  title: "Microsoft Raises Quarterly Dividend 10% to $0.88/Share" },
  { ticker: "JPM",   title: "JPMorgan Q4 Net Interest Income $24.1B, Topping $22.8B Consensus" },
  { ticker: "SMCI",  title: "Super Micro Raises FY2026 Revenue Guidance to $26-30B vs $22B Est" },
  { ticker: "GME",   title: "GameStop Announces $1B Bitcoin Treasury Reserve Strategy" },
];

const _now = Date.now();
const ago = (ms: number) => new Date(_now - ms).toISOString();

function buildDummyArticles(feedId: string): FeedArticle[] {
  return STORY_BASE.map((s, i) => ({
    id: `${feedId}-demo-${i}`,
    ticker: s.ticker,
    title: s.title,
    receivedAt: ago((STORY_BASE.length - i) * 5 * 60_000),
    source: feedId,
    live: false,
  }));
}

function toLiveFeedArticle(a: NewsArticle, idx: number): FeedArticle {
  return {
    id: `${a.source ?? "live"}-${a.receivedAt}-${idx}`,
    ticker: a.ticker,
    title: a.title,
    receivedAt: a.receivedAt,
    source: a.source ?? "unknown",
    live: true,
  };
}

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

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

// ── Highlighted text ──────────────────────────────────────────────────────

function HighlightedText({ text, className }: { text: string; className?: string }) {
  const parts = highlightKeywords(text);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.highlight ? (
          <mark key={i} className="bg-yellow-400/20 text-yellow-300 rounded-sm px-px">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}

// ── Speed badge ───────────────────────────────────────────────────────────

function SpeedBadge({ receivedAt }: { receivedAt: string }) {
  const ageMs = Date.now() - new Date(receivedAt).getTime();
  if (ageMs < 30_000) {
    return (
      <span className="ml-auto shrink-0 text-[8px] font-bold text-red-400 bg-red-500/10 px-1 py-0.5 rounded border border-red-600/30">
        JUST IN
      </span>
    );
  }
  if (ageMs < 2 * 60_000) {
    return (
      <span className="ml-auto shrink-0 text-[8px] font-bold text-orange-400 bg-orange-500/10 px-1 py-0.5 rounded border border-orange-600/30">
        NEW
      </span>
    );
  }
  return null;
}

// ── Star rating ───────────────────────────────────────────────────────────

function Stars({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <span className="shrink-0 flex gap-px" title={`${count} star${count !== 1 ? "s" : ""}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-[8px] leading-none ${i < count ? "text-yellow-400" : "text-muted opacity-30"}`}
        >
          ★
        </span>
      ))}
    </span>
  );
}

// ── Status banner ────────────────────────────────────────────────────────

function StatusBanner({
  feeds,
  articlesByFeed,
}: {
  feeds: FeedConfig[];
  articlesByFeed: Map<string, FeedArticle[]>;
}) {
  return (
    <div className="flex items-center gap-6 px-4 py-2 border-b border-border bg-panel shrink-0 overflow-x-auto">
      <span className="text-muted text-[10px] uppercase tracking-wide whitespace-nowrap">Feeds</span>
      <div className="flex items-center gap-5">
        {feeds.map((f) => {
          const count = articlesByFeed.get(f.id)?.length ?? 0;
          return (
            <div key={f.id} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className={`w-1.5 h-1.5 rounded-full ${f.connected ? f.dotColor : "bg-muted"}`} />
              <span className={`text-[10px] font-semibold ${f.color}`}>{f.shortName}</span>
              <span className="text-[10px] text-muted font-mono">
                {count} {f.connected ? "live" : "demo"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Single feed column ─────────────────────────────────────────────────────

function FeedColumn({
  feed,
  articles,
  onTickerClick,
}: {
  feed: FeedConfig;
  articles: FeedArticle[];
  onTickerClick: (ticker: string) => void;
}) {
  return (
    <div className="flex flex-col flex-1 min-w-0 border border-border rounded bg-panel overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${feed.connected ? feed.dotColor : "bg-muted"}`} />
            <span className={`text-xs font-semibold ${feed.color}`}>{feed.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {articles.length > 0 && (
              <span className="text-[10px] text-muted">{articles.length} articles</span>
            )}
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                feed.connected
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-600/30"
                  : "bg-surface text-muted border-border"
              }`}
            >
              {feed.connected ? "LIVE" : "DEMO"}
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted truncate mt-0.5">{feed.description}</p>
        {!feed.connected && feed.configKey && (
          <div className="mt-1">
            <span className="text-[9px] text-muted font-mono bg-surface px-1 py-0.5 rounded border border-border">
              {feed.configKey}
            </span>
          </div>
        )}
      </div>

      {/* Articles */}
      <div className="overflow-y-auto flex-1">
        {articles.map((a) => {
          const stars = deriveStars(a.title);
          return (
            <div
              key={a.id}
              className="border-b border-border px-2.5 py-2 hover:bg-surface cursor-pointer"
              onClick={() => onTickerClick(a.ticker)}
            >
              {/* Row 1: time · stars · ticker · age · speed badge */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-mono text-muted shrink-0">
                  {fmtTime(a.receivedAt)}
                </span>
                <Stars count={stars} />
                <span className={`text-[10px] font-semibold shrink-0 ${feed.color}`}>
                  {a.ticker}
                </span>
                <span className="text-[9px] text-muted shrink-0">{fmtAge(a.receivedAt)}</span>
                {a.live && <SpeedBadge receivedAt={a.receivedAt} />}
              </div>
              {/* Row 2: headline with keyword highlights */}
              <HighlightedText
                text={a.title}
                className="text-white text-[11px] leading-snug line-clamp-2 block"
              />
            </div>
          );
        })}
        {articles.length === 0 && (
          <div className="text-muted text-xs text-center py-6">
            {feed.connected ? "Waiting for articles…" : "No articles yet"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TradingView Chart ─────────────────────────────────────────────────────

function MiniChart({ symbol }: { symbol: string }) {
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
      interval: "1",
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
      studies: ["STD;VWAP", "STD;EMA@tv-basicstudies", "STD;Volume"],
      support_host: "https://www.tradingview.com",
    });

    container.appendChild(script);

    return () => {
      if (container) container.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div className="flex flex-col border border-border rounded bg-panel overflow-hidden" style={{ minHeight: 300 }}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
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

// ── News Trades Panel ─────────────────────────────────────────────────────

function NewsTradesPanel({ onTickerClick }: { onTickerClick: (t: string) => void }) {
  const token = useAuthStore((s) => s.token);
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch("/api/trades/journal?limit=50", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          // Only show trades that had a news catalyst
          setTrades(data.filter((t: JournalTrade) => t.catalyst));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="flex flex-col border border-border rounded bg-panel overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
        <span className="text-white text-xs font-semibold">News Trades</span>
        <span className="text-muted text-[10px] ml-auto">{trades.length} trades</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
        {loading && (
          <div className="text-muted text-xs text-center py-4">Loading trades…</div>
        )}
        {!loading && trades.length === 0 && (
          <div className="text-muted text-xs text-center py-4">No news-triggered trades yet</div>
        )}
        {trades.map((t) => {
          const isOpen = t.buyStatus === "filled" && (t.sellStatus === "awaiting" || t.sellStatus === "pending");
          const returnPct = t.analytics?.returnPct ?? null;
          const headline = t.analytics?.newsHeadline ?? t.catalyst;
          return (
            <div
              key={t.id}
              className="border-b border-border px-2.5 py-1.5 hover:bg-surface cursor-pointer"
              onClick={() => onTickerClick(t.ticker)}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-mono text-muted shrink-0">
                  {fmtTime(t.createdAt)}
                </span>
                <span className="text-accent text-[10px] font-semibold shrink-0">
                  {t.ticker}
                </span>
                <span className={`text-[9px] font-mono shrink-0 ${
                  t.catalystType === "tier1" ? "text-red-400" :
                  t.catalystType === "tier2" ? "text-purple-400" :
                  t.catalystType === "tier3" ? "text-blue-400" : "text-muted"
                }`}>
                  {t.catalystType.toUpperCase()}
                </span>
                {isOpen ? (
                  <span className="ml-auto text-[8px] font-bold text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded border border-blue-500/30">
                    HOLDING
                  </span>
                ) : returnPct != null ? (
                  <span className={`ml-auto text-[9px] font-mono font-semibold ${returnPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
                  </span>
                ) : null}
              </div>
              <HighlightedText
                text={headline}
                className="text-white text-[10px] leading-snug line-clamp-1 block"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Top Movers Panel ──────────────────────────────────────────────────────

function TopMoversPanel({ onTickerClick }: { onTickerClick: (t: string) => void }) {
  const token = useAuthStore((s) => s.token);
  const [movers, setMovers] = useState<MoverData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const fetchMovers = () => {
      fetch("/api/movers", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => { if (Array.isArray(data)) setMovers(data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    fetchMovers();
    const interval = setInterval(fetchMovers, 30_000);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <div className="flex flex-col border border-border rounded bg-panel overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
        <span className="text-white text-xs font-semibold">Top Movers</span>
        <span className="text-muted text-[10px] ml-auto">today</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
        {loading && (
          <div className="text-muted text-xs text-center py-4">Loading movers…</div>
        )}
        {!loading && movers.length === 0 && (
          <div className="text-muted text-xs text-center py-4">No market data available</div>
        )}
        {movers.map((m) => (
          <div
            key={m.ticker}
            className="border-b border-border px-2.5 py-1.5 hover:bg-surface cursor-pointer"
            onClick={() => onTickerClick(m.ticker)}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-white text-[11px] font-semibold shrink-0 w-12">
                {m.ticker}
              </span>
              <span className="text-[10px] font-mono text-muted shrink-0">
                ${m.price.toFixed(2)}
              </span>
              <span className={`text-[10px] font-mono font-semibold shrink-0 ${
                m.changePct >= 0 ? "text-emerald-400" : "text-red-400"
              }`}>
                {m.changePct >= 0 ? "+" : ""}{m.changePct.toFixed(2)}%
              </span>
              <span className="text-[9px] text-muted shrink-0">
                {fmtVol(m.volume)}
              </span>
              {m.relativeVolume >= 2 && (
                <span className="text-[8px] font-bold text-orange-400 bg-orange-500/10 px-1 py-0.5 rounded border border-orange-600/30">
                  {m.relativeVolume.toFixed(1)}x RV
                </span>
              )}
              {m.hasNews && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent shrink-0" title="Has recent news" />
              )}
            </div>
            {/* Show first article if any */}
            {m.articles.length > 0 && (
              <HighlightedText
                text={m.articles[0].title}
                className="text-muted text-[10px] leading-snug line-clamp-1 block"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main NewsFeedsPage ────────────────────────────────────────────────────

export function NewsFeedsPage() {
  const liveArticles = useNewsStore((s) => s.articles);
  const [chartSymbol, setChartSymbol] = useState("NASDAQ:SPY");

  const handleTickerClick = useCallback((ticker: string) => {
    const tvSymbol = ticker.includes(":") ? ticker : `NASDAQ:${ticker}`;
    setChartSymbol(tvSymbol);
  }, []);

  // Build article lists: live data for connected feeds, demo for others
  const articlesByFeed = useMemo(() => {
    const map = new Map<string, FeedArticle[]>();

    const rtprArticles: FeedArticle[] = [];
    const benzingaArticles: FeedArticle[] = [];

    liveArticles.forEach((a, i) => {
      const fa = toLiveFeedArticle(a, i);
      if (a.source === "rtpr") rtprArticles.push(fa);
      else if (a.source === "benzinga") benzingaArticles.push(fa);
    });

    for (const feed of FEEDS) {
      if (feed.id === "rtpr") {
        map.set(feed.id, rtprArticles);
      } else if (feed.id === "benzinga") {
        map.set(feed.id, benzingaArticles);
      } else {
        map.set(feed.id, buildDummyArticles(feed.id));
      }
    }

    return map;
  }, [liveArticles]);

  return (
    <div className="h-screen w-screen flex flex-col bg-surface overflow-hidden font-mono">
      <TopNav />

      {/* Status banner */}
      <StatusBanner feeds={FEEDS} articlesByFeed={articlesByFeed} />

      {/* Main content: feeds left, chart + panels right */}
      <div className="flex-1 flex gap-2 p-3 overflow-hidden min-h-0">
        {/* Left: Feed columns */}
        <div className="flex gap-2 flex-[3] min-w-0 overflow-hidden">
          {FEEDS.map((feed) => (
            <FeedColumn
              key={feed.id}
              feed={feed}
              articles={articlesByFeed.get(feed.id) ?? []}
              onTickerClick={handleTickerClick}
            />
          ))}
        </div>

        {/* Right: Chart + panels */}
        <div className="flex flex-col gap-2 flex-[2] min-w-0 overflow-hidden">
          {/* Chart */}
          <div className="flex-1 min-h-0">
            <MiniChart symbol={chartSymbol} />
          </div>

          {/* News Trades */}
          <NewsTradesPanel onTickerClick={handleTickerClick} />

          {/* Top Movers */}
          <TopMoversPanel onTickerClick={handleTickerClick} />
        </div>
      </div>
    </div>
  );
}
