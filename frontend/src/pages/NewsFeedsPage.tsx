/**
 * News Feeds Page
 *
 * Side-by-side view of multiple news feed providers.
 * Disconnected feeds show demo articles for evaluation.
 */
import { useMemo, useState } from "react";
import { TopNav } from "../components/layout/TopNav";
import { useNewsStore } from "../store/newsStore";
import { deriveStars, fmtTime, highlightKeywords } from "../utils/newsUtils";
import { ChartPanel } from "../components/panels/ChartPanel";
import { TradesPanel } from "../components/panels/TradesPanel";
import { ScannerPanel } from "../components/panels/ScannerPanel";
import { useSocket } from "../hooks/useSocket";
import { useDummyData } from "../hooks/useDummyData";

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
  connected: boolean;
  configKey?: string;
  color: string;
  dotColor: string;
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
    id: "alpaca",
    name: "Alpaca News",
    shortName: "APN",
    description: "Alpaca Markets news feed — via data API.",
    connected: false,
    configKey: "ALPACA_API_KEY",
    color: "text-yellow-400",
    dotColor: "bg-yellow-400",
  },
];

// ── Demo articles ──────────────────────────────────────────────────────────

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

function buildDemoArticles(feedId: string): FeedArticle[] {
  return STORY_BASE.map((s, i) => ({
    id: `${feedId}-${i}`,
    ticker: s.ticker,
    title: s.title,
    receivedAt: ago((STORY_BASE.length - i) * 5 * 60_000),
    source: feedId,
    storyIdx: i,
  }));
}

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

function Stars({ count }: { count: number }) {
  return (
    <span className="shrink-0 flex gap-px">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-[9px] leading-none ${i < count ? "text-yellow-400" : "text-muted opacity-30"}`}
        >
          ★
        </span>
      ))}
    </span>
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

function FeedArticleRow({ article, feedColor }: { article: FeedArticle; feedColor: string }) {
  const stars = deriveStars(article.title);
  return (
    <div className="border-b border-border px-2 py-1.5 hover:bg-surface cursor-pointer">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-muted text-[10px] font-mono shrink-0">{fmtTime(article.receivedAt)}</span>
        <Stars count={stars} />
        <span className={`text-[11px] font-semibold font-mono shrink-0 ${feedColor}`}>
          {article.ticker}
        </span>
        <span className="text-[9px] text-muted shrink-0">{fmtAge(article.receivedAt)}</span>
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
}: {
  feed: FeedConfig;
  articles: FeedArticle[];
}) {
  const displayCount = articles.length;

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
            {displayCount > 0 && (
              <span className="text-[10px] text-muted">
                {displayCount} {feed.connected ? "live" : "articles"}
              </span>
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
          <span className="inline-block mt-1 text-[9px] text-muted font-mono bg-surface px-1 py-0.5 rounded border border-border">
            {feed.configKey}
          </span>
        )}
      </div>

      {/* Articles */}
      <div className="overflow-y-auto flex-1">
        {articles.map((a) => (
          <FeedArticleRow key={a.id} article={a} feedColor={feed.color} />
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
  useDummyData();
  const allArticles = useNewsStore((s) => s.articles);
  const [selectedFeeds, setSelectedFeeds] = useState<Set<string>>(
    () => new Set(FEEDS.map((f) => f.id))
  );

  const toggleFeed = (id: string) => {
    setSelectedFeeds((prev) => {
      const next = new Set(prev);
      if (next.has(id) && next.size > 1) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Connected feeds: filter live articles by source. Disconnected: show demo.
  const articlesByFeed = useMemo(() => {
    const map = new Map<string, FeedArticle[]>();
    for (const feed of FEEDS) {
      if (feed.connected) {
        map.set(
          feed.id,
          allArticles
            .filter((a) => a.source === feed.id)
            .map((a, i): FeedArticle => ({
              id: `${a.ticker}-${a.receivedAt}-${i}`,
              ticker: a.ticker,
              title: a.title,
              receivedAt: a.receivedAt,
              source: feed.id,
              storyIdx: i,
            }))
        );
      } else {
        map.set(feed.id, buildDemoArticles(feed.id));
      }
    }
    return map;
  }, [allArticles]);

  const visibleFeeds = FEEDS.filter((f) => selectedFeeds.has(f.id));

  return (
    <div className="h-screen w-screen flex flex-col bg-surface overflow-hidden font-mono">
      <TopNav />

      {/* Feed filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-panel shrink-0">
        <span className="text-[10px] text-muted uppercase tracking-wide">Feeds</span>
        {FEEDS.map((f) => {
          const count = articlesByFeed.get(f.id)?.length ?? 0;
          const label = f.connected ? "live" : "demo";
          return (
            <button
              key={f.id}
              onClick={() => toggleFeed(f.id)}
              className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded border transition-colors ${
                selectedFeeds.has(f.id)
                  ? `${f.color} border-current bg-current/10`
                  : "text-muted border-border hover:text-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${f.connected ? f.dotColor : "bg-muted"}`} />
              {f.shortName} {count} {label}
            </button>
          );
        })}
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
            />
          ))}
        </div>

        {/* Right panel: chart + trades + top movers */}
        <div className="flex-[2] flex flex-col gap-2 min-w-0 overflow-hidden">
          <div className="flex-[3] min-h-0 border border-border rounded overflow-hidden">
            <ChartPanel panelId="newsfeeds-chart" symbol="AMEX:SPY" />
          </div>
          <div className="flex-[1] min-h-0 border border-border rounded overflow-hidden">
            <TradesPanel />
          </div>
          <div className="flex-[1] min-h-0 border border-border rounded overflow-hidden">
            <ScannerPanel scannerId="gap_up" title="Top Movers" />
          </div>
        </div>

      </div>
    </div>
  );
}
