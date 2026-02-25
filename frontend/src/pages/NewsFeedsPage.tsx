/**
 * News Feeds Page
 *
 * Side-by-side view of news feed providers.
 * Connected feeds (RTPR, Benzinga) show live articles from WebSocket.
 * Unconnected feeds show demo data with simulated latency.
 */
import { useMemo, useState } from "react";
import { TopNav } from "../components/layout/TopNav";
import { useNewsStore } from "../store/newsStore";
import { NewsArticle } from "../types";

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
  color: string;       // tailwind text color
  dotColor: string;    // tailwind bg color for status dot
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
  {
    id: "globe",
    name: "Globe Newswire",
    shortName: "GLOBE",
    description: "Press releases and corporate announcements.",
    connected: false,
    configKey: "GLOBE_API_KEY",
    color: "text-purple-400",
    dotColor: "bg-purple-400",
  },
  {
    id: "businesswire",
    name: "Business Wire",
    shortName: "BW",
    description: "Global press release distribution network.",
    connected: false,
    configKey: "BW_API_KEY",
    color: "text-orange-400",
    dotColor: "bg-orange-400",
  },
];

// ── Demo data for unconnected feeds ──────────────────────────────────────

const STORY_BASE: { ticker: string; title: string }[] = [
  { ticker: "AAPL",  title: "Apple Announces Strategic Partnership with OpenAI for On-Device Models" },
  { ticker: "NVDA",  title: "NVIDIA Reports Record Q4 Revenue of $39.3B, Beats Estimates by 12%" },
  { ticker: "TSLA",  title: "Tesla Receives NHTSA Approval for Full Self-Driving in 12 States" },
  { ticker: "AMZN",  title: "Amazon Secures $4.7B DoD Cloud Contract, Expanding AWS GovCloud" },
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

// Convert a live NewsArticle into a FeedArticle
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
}: {
  feed: FeedConfig;
  articles: FeedArticle[];
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
        {articles.map((a) => (
          <div
            key={a.id}
            className="border-b border-border px-2.5 py-2 hover:bg-surface"
          >
            {/* Row 1: time · ticker · age */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-mono text-muted shrink-0">
                {fmtTime(a.receivedAt)}
              </span>
              <span className={`text-[10px] font-semibold shrink-0 ${feed.color}`}>
                {a.ticker}
              </span>
              <span className="text-[9px] text-muted shrink-0">{fmtAge(a.receivedAt)}</span>
              {a.live && (
                <span className="ml-auto text-[8px] font-bold text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-600/30">
                  LIVE
                </span>
              )}
            </div>
            {/* Row 2: headline */}
            <p className="text-white text-[11px] leading-snug line-clamp-2">{a.title}</p>
          </div>
        ))}
        {articles.length === 0 && (
          <div className="text-muted text-xs text-center py-6">
            {feed.connected ? "Waiting for articles…" : "No articles yet"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main NewsFeedsPage ────────────────────────────────────────────────────

export function NewsFeedsPage() {
  const liveArticles = useNewsStore((s) => s.articles);
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

  // Build article lists: live data for connected feeds, demo for others
  const articlesByFeed = useMemo(() => {
    const map = new Map<string, FeedArticle[]>();

    // Split live articles by source
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

  const visibleFeeds = FEEDS.filter((f) => selectedFeeds.has(f.id));

  return (
    <div className="h-screen w-screen flex flex-col bg-surface overflow-hidden font-mono">
      <TopNav />

      {/* Status banner */}
      <StatusBanner feeds={FEEDS} articlesByFeed={articlesByFeed} />

      {/* Feed toggles */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-panel shrink-0 flex-wrap">
        <span className="text-[10px] text-muted uppercase tracking-wide">Show:</span>
        {FEEDS.map((f) => (
          <button
            key={f.id}
            onClick={() => toggleFeed(f.id)}
            className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
              selectedFeeds.has(f.id)
                ? `${f.color} border-current bg-current/10`
                : "text-muted border-border hover:text-white"
            }`}
          >
            {f.shortName}
          </button>
        ))}
      </div>

      {/* Feed columns */}
      <div className="flex-1 flex gap-2 p-3 overflow-hidden min-h-0">
        {visibleFeeds.map((feed) => (
          <FeedColumn
            key={feed.id}
            feed={feed}
            articles={articlesByFeed.get(feed.id) ?? []}
          />
        ))}
      </div>
    </div>
  );
}
