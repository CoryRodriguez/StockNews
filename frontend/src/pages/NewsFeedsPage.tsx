/**
 * News Feeds Page
 *
 * Side-by-side view of multiple news feed providers.
 */
import { useEffect, useMemo, useState } from "react";
import { TopNav } from "../components/layout/TopNav";
import { useNewsStore } from "../store/newsStore";
import { useAuthStore } from "../store/authStore";
import { useDashboardStore } from "../store/dashboardStore";
import { deriveStars, fmtTime, highlightKeywords } from "../utils/newsUtils";
import { ChartPanel } from "../components/panels/ChartPanel";
import { TradesPanel } from "../components/panels/TradesPanel";
import { ScannerPanel } from "../components/panels/ScannerPanel";
import { useSocket } from "../hooks/useSocket";
import { useHourlyChanges } from "../hooks/useHourlyChanges";
import { Modal } from "../components/ui/Modal";
import { AiAnalysisContent } from "../components/modals/AiAnalysisContent";
import { ArticleContent } from "../components/modals/ArticleContent";
import { NewsArticle } from "../types";

// ── Types ──────────────────────────────────────────────────────────────────

interface FeedArticle {
  id: string;
  ticker: string;
  title: string;
  receivedAt: string;
  source: string;
  storyIdx: number;
}

interface FeedConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  color: string;
  dotColor: string;
}

// ── Static feed config ─────────────────────────────────────────────────────

const FEEDS: FeedConfig[] = [
  {
    id: "rtpr",
    name: "RTPR.io",
    shortName: "RTPR",
    description: "Real-time press release aggregation via WebSocket.",
    color: "text-emerald-400",
    dotColor: "bg-emerald-400",
  },
  {
    id: "benzinga",
    name: "Benzinga",
    shortName: "BZG",
    description: "Financial news REST feed — polled every 15s.",
    color: "text-blue-400",
    dotColor: "bg-blue-400",
  },
  {
    id: "alpaca",
    name: "Alpaca News",
    shortName: "APN",
    description: "Alpaca Markets news feed — via data API.",
    color: "text-yellow-400",
    dotColor: "bg-yellow-400",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ── Article row components ─────────────────────────────────────────────────

function Stars({ count, isAiRated, onClick }: { count: number; isAiRated: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-px cursor-pointer hover:opacity-80 transition-opacity"
      title={isAiRated ? `AI: ${count}★ — click for analysis` : `${count}★ (keyword)`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-[9px] leading-none ${
            i < count
              ? isAiRated ? "text-accent" : "text-yellow-400"
              : "text-muted opacity-30"
          }`}
        >
          ★
        </span>
      ))}
      {isAiRated && (
        <span className="text-[7px] text-accent font-bold ml-0.5 leading-none">AI</span>
      )}
    </button>
  );
}

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

function FeedArticleRow({
  article,
  fullArticle,
  feedColor,
  onArticleClick,
  hourChangePct,
}: {
  article: FeedArticle;
  fullArticle?: NewsArticle;
  feedColor: string;
  onArticleClick: (ticker: string) => void;
  hourChangePct?: number;
}) {
  const openModal = useNewsStore((s) => s.openModal);
  const displayStars = fullArticle?.aiStars ?? deriveStars(article.title);
  const isAiRated = fullArticle?.aiStars != null;

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (fullArticle) openModal(fullArticle, "ai");
  };

  const handleReadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (fullArticle) openModal(fullArticle, "article");
  };

  return (
    <div
      className="border-b border-border px-2 py-1.5 hover:bg-raised cursor-pointer"
      onClick={() => onArticleClick(article.ticker)}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-muted text-[10px] font-mono shrink-0">{fmtTime(article.receivedAt)}</span>
        <Stars count={displayStars} isAiRated={isAiRated} onClick={handleStarClick} />
        <span className={`text-[11px] font-semibold font-mono shrink-0 ${feedColor}`}>
          {article.ticker}
        </span>
        <span className="text-[9px] text-muted shrink-0">{fmtAge(article.receivedAt)}</span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {hourChangePct !== undefined && Math.abs(hourChangePct) >= 0.01 && (
            <span
              className={`text-[10px] font-mono font-semibold ${
                hourChangePct > 0 ? "text-up" : "text-down"
              }`}
            >
              {hourChangePct > 0 ? "+" : ""}{hourChangePct.toFixed(2)}%
            </span>
          )}
          {fullArticle && (
            <button
              onClick={handleReadClick}
              className="shrink-0 text-muted hover:text-white text-[10px] leading-none transition-colors"
              title="Read full article"
            >
              ◉
            </button>
          )}
        </div>
      </div>
      <HighlightedText
        text={article.title}
        className="text-white text-xs leading-tight line-clamp-2 block"
      />
    </div>
  );
}

// ── Single feed column ─────────────────────────────────────────────────────

function FeedColumn({
  feed,
  articles,
  allArticles,
  onArticleClick,
  hourlyChanges,
}: {
  feed: FeedConfig;
  articles: FeedArticle[];
  allArticles: NewsArticle[];
  onArticleClick: (ticker: string) => void;
  hourlyChanges: Record<string, number>;
}) {
  const displayCount = articles.length;

  // Build a lookup for full articles
  const fullArticleMap = useMemo(() => {
    const map = new Map<string, NewsArticle>();
    for (const a of allArticles) {
      if (a.source === feed.id) {
        map.set(`${a.ticker}-${a.receivedAt}`, a);
      }
    }
    return map;
  }, [allArticles, feed.id]);

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
            {displayCount > 0 && (
              <span className="text-[10px] text-muted">
                {displayCount} live
              </span>
            )}
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-600/30"
            >
              LIVE
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted truncate mt-0.5">{feed.description}</p>
      </div>

      {/* Articles */}
      <div className="overflow-y-auto flex-1">
        {articles.map((a) => (
          <FeedArticleRow
            key={a.id}
            article={a}
            fullArticle={fullArticleMap.get(`${a.ticker}-${a.receivedAt}`)}
            feedColor={feed.color}
            onArticleClick={onArticleClick}
            hourChangePct={hourlyChanges[a.ticker]}
          />
        ))}
        {articles.length === 0 && (
          <div className="text-muted text-xs text-center py-6">Waiting for articles…</div>
        )}
      </div>
    </div>
  );
}

// ── Main NewsFeedsPage ─────────────────────────────────────────────────────

export function NewsFeedsPage() {
  useSocket();
  const allArticles = useNewsStore((s) => s.articles);
  const addArticle = useNewsStore((s) => s.addArticle);
  const { modalArticle, modalType, closeModal } = useNewsStore();
  const token = useAuthStore((s) => s.token);
  const activeTicker = useDashboardStore((s) => s.activeTicker);
  const setActiveTicker = useDashboardStore((s) => s.setActiveTicker);
  const [selectedFeeds, setSelectedFeeds] = useState<Set<string>>(
    () => new Set(FEEDS.map((f) => f.id))
  );
  const [minStars, setMinStars] = useState(1);
  const [tickerFilter, setTickerFilter] = useState("");

  const chartSymbol = activeTicker || "AMEX:SPY";

  const handleArticleClick = (ticker: string) => setActiveTicker(ticker);

  // Load recent articles from REST on mount so articles received before
  // the page loaded are visible immediately (don't wait for next WS push)
  useEffect(() => {
    if (!token) return;
    fetch("/api/news/recent", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((articles: { ticker: string; title: string; body: string; author: string; source: string; createdAt: string; receivedAt: string; url?: string; id?: number; aiStars?: number; aiAnalysis?: string; aiConfidence?: string }[]) => {
        // Add oldest-first so newest ends up at the top of the store
        for (const a of [...articles].reverse()) addArticle(a as Parameters<typeof addArticle>[0]);
      })
      .catch(() => {/* ignore */});
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFeed = (id: string) => {
    setSelectedFeeds((prev) => {
      const next = new Set(prev);
      if (next.has(id) && next.size > 1) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const articlesByFeed = useMemo(() => {
    const map = new Map<string, FeedArticle[]>();
    const tickerUpper = tickerFilter.trim().toUpperCase();
    for (const feed of FEEDS) {
      let articles = allArticles
        .filter((a) => {
          if (a.source !== feed.id) return false;
          const stars = a.aiStars ?? deriveStars(a.title);
          return stars >= minStars;
        })
        .map((a, i): FeedArticle => ({
          id: `${a.ticker}-${a.receivedAt}-${i}`,
          ticker: a.ticker,
          title: a.title,
          receivedAt: a.receivedAt,
          source: feed.id,
          storyIdx: i,
        }));
      if (tickerUpper) {
        articles = articles.filter((a) => a.ticker.includes(tickerUpper));
      }
      map.set(feed.id, articles);
    }
    return map;
  }, [allArticles, minStars, tickerFilter]);

  const allTickers = useMemo(
    () => [...new Set([...FEEDS].flatMap((f) => (articlesByFeed.get(f.id) ?? []).map((a) => a.ticker)))],
    [articlesByFeed]
  );
  const hourlyChanges = useHourlyChanges(allTickers);

  const visibleFeeds = FEEDS.filter((f) => selectedFeeds.has(f.id));

  return (
    <div className="h-screen w-screen flex flex-col bg-base overflow-hidden">
      <TopNav />

      {/* Feed filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-panel shrink-0 overflow-x-auto">
        <span className="text-[10px] text-muted uppercase tracking-wide shrink-0">Feeds</span>
        {FEEDS.map((f) => {
          const count = articlesByFeed.get(f.id)?.length ?? 0;
          return (
            <button
              key={f.id}
              onClick={() => toggleFeed(f.id)}
              className={`shrink-0 flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded border transition-colors ${
                selectedFeeds.has(f.id)
                  ? `${f.color} border-current bg-current/10`
                  : "text-muted border-border hover:text-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${f.dotColor}`} />
              {f.shortName} {count} live
            </button>
          );
        })}
        <div className="w-px bg-border mx-1 self-stretch shrink-0" />
        <span className="text-[10px] text-yellow-400 uppercase tracking-wide shrink-0">Ticker</span>
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="text"
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
            className="text-[11px] px-2 py-0.5 rounded border border-yellow-500/50 bg-yellow-400/10 text-yellow-300 placeholder:text-yellow-600/60 w-24 font-mono focus:border-yellow-400/70 focus:outline-none"
          />
          {tickerFilter && (
            <button
              onClick={() => setTickerFilter("")}
              className="text-[10px] text-yellow-600 hover:text-yellow-300 leading-none"
            >
              ✕
            </button>
          )}
        </div>
        <div className="w-px bg-border mx-1 self-stretch shrink-0" />
        <span className="text-[10px] text-muted uppercase tracking-wide shrink-0">Stars</span>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            onClick={() => setMinStars(minStars === s && s > 1 ? 1 : s)}
            className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded border transition-colors ${
              minStars === s && s > 1
                ? "text-yellow-400 border-yellow-500/50 bg-yellow-400/10"
                : s <= minStars && minStars > 1
                ? "text-yellow-400/60 border-yellow-600/30"
                : "text-muted border-border hover:text-white"
            }`}
          >
            {"★".repeat(s)}{s < 5 ? "+" : ""}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-2 p-3 overflow-hidden min-h-0">

        {/* Feed columns */}
        <div className="flex-[3] flex gap-2 min-w-0 overflow-hidden">
          {visibleFeeds.map((feed) => (
            <FeedColumn
              key={feed.id}
              feed={feed}
              articles={articlesByFeed.get(feed.id) ?? []}
              allArticles={allArticles}
              onArticleClick={handleArticleClick}
              hourlyChanges={hourlyChanges}
            />
          ))}
        </div>

        {/* Right panel: chart + trades + top movers */}
        <div className="flex-[2] flex flex-col gap-2 min-w-0 overflow-hidden">
          <div className="flex-[3] min-h-0 border border-border rounded overflow-hidden">
            <ChartPanel panelId="newsfeeds-chart" symbol={chartSymbol} />
          </div>
          <div className="flex-[1] min-h-0 border border-border rounded overflow-hidden">
            <TradesPanel />
          </div>
          <div className="flex-[1] min-h-0 border border-border rounded overflow-hidden">
            <ScannerPanel scannerId="gap_up" title="Top Movers" />
          </div>
        </div>

      </div>

      {/* Modal */}
      {modalArticle && modalType && (
        <Modal
          title={modalType === "ai" ? "AI Analysis" : "Article"}
          onClose={closeModal}
        >
          {modalType === "ai" ? (
            <AiAnalysisContent article={modalArticle} />
          ) : (
            <ArticleContent article={modalArticle} />
          )}
        </Modal>
      )}
    </div>
  );
}
