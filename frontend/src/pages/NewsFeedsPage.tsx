/**
 * News Feeds Page
 *
 * Side-by-side comparison of multiple news feed providers.
 * Lets you observe latency differences between sources.
 * Currently only RTPR.io is integrated; others show dummy data
 * so you can evaluate layout and speed comparisons.
 */
import { useMemo, useState } from "react";
import { TopNav } from "../components/layout/TopNav";
import { useNewsStore } from "../store/newsStore";

// ── Types ──────────────────────────────────────────────────────────────────

interface FeedArticle {
  id: string;
  ticker: string;
  title: string;
  receivedAt: string; // ISO
  source: string;
}

interface FeedConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  connected: boolean;
  configKey?: string; // env var needed
  color: string; // tailwind text color class
  avgLatencyMs: number | null; // null = not measured yet
}

// ── Static feed config ─────────────────────────────────────────────────────

const FEEDS: FeedConfig[] = [
  {
    id: "rtpr",
    name: "RTPR.io",
    shortName: "RTPR",
    description: "Real-time press release aggregation. Currently integrated.",
    connected: true,
    color: "text-up",
    avgLatencyMs: null,
  },
  {
    id: "benzinga",
    name: "Benzinga Pro",
    shortName: "BZG",
    description: "High-speed financial news and analysis.",
    connected: false,
    configKey: "BENZINGA_API_KEY",
    color: "text-blue-400",
    avgLatencyMs: null,
  },
  {
    id: "dowjones",
    name: "Dow Jones Newswires",
    shortName: "DJN",
    description: "Premium institutional-grade news wire.",
    connected: false,
    configKey: "DJ_API_KEY",
    color: "text-yellow-400",
    avgLatencyMs: null,
  },
  {
    id: "globe",
    name: "Globe Newswire",
    shortName: "GLOBE",
    description: "Press releases and corporate announcements.",
    connected: false,
    configKey: "GLOBE_API_KEY",
    color: "text-purple-400",
    avgLatencyMs: null,
  },
  {
    id: "businesswire",
    name: "Business Wire",
    shortName: "BW",
    description: "Global press release distribution network.",
    connected: false,
    configKey: "BW_API_KEY",
    color: "text-orange-400",
    avgLatencyMs: null,
  },
];

// ── Dummy articles per feed ────────────────────────────────────────────────
// Simulates the same underlying news stories arriving at different speeds.

const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();

const STORY_BASE: { ticker: string; title: string }[] = [
  { ticker: "AAPL", title: "Apple Announces Strategic Partnership with OpenAI for On-Device Models" },
  { ticker: "NVDA", title: "NVIDIA Reports Record Q4 Revenue of $39.3B, Beats Estimates by 12%" },
  { ticker: "TSLA", title: "Tesla Receives NHTSA Approval for Full Self-Driving in 12 States" },
  { ticker: "AMZN", title: "Amazon Secures $4.7B DoD Cloud Contract, Expanding AWS GovCloud" },
  { ticker: "META", title: "Meta Platforms Q4 EPS $8.02 vs $6.77 Est; Revenue Up 21% YoY" },
  { ticker: "BIIB", title: "Biogen FDA Accelerated Approval Granted for ALZ-303 Alzheimer Treatment" },
  { ticker: "MRNA", title: "Moderna Phase 3 mRNA-4157 Cancer Vaccine Shows 44% Reduction in Recurrence" },
  { ticker: "GOOGL", title: "Alphabet to Acquire Cloud Security Firm Wiz for $23B — WSJ" },
  { ticker: "MSFT", title: "Microsoft Raises Quarterly Dividend 10% to $0.88/Share" },
  { ticker: "JPM", title: "JPMorgan Q4 Net Interest Income $24.1B, Topping $22.8B Consensus" },
];

// Each feed gets stories at different offsets (simulating latency)
const LATENCY_OFFSETS: Record<string, number[]> = {
  rtpr:         [820,  1250, 650,  980,  1100, 720,  880,  1400, 590,  760],
  benzinga:     [1100, 1450, 920,  1200, 1380, 1050, 1240, 1700, 880,  1020],
  dowjones:     [950,  1380, 810,  1100, 1220, 900,  1010, 1550, 720,  910],
  globe:        [2200, 2750, 1980, 2400, 2600, 2100, 2350, 3100, 1850, 2150],
  businesswire: [2850, 3400, 2600, 3100, 3300, 2750, 3050, 3800, 2400, 2780],
};

function buildDummyArticles(feedId: string): FeedArticle[] {
  const offsets = LATENCY_OFFSETS[feedId] ?? [];
  return STORY_BASE.map((s, i) => ({
    id: `${feedId}-${i}`,
    ticker: s.ticker,
    title: s.title,
    // Stories published every ~3-8 minutes, each feed received it at different lag
    receivedAt: ago((STORY_BASE.length - i) * 5 * 60_000 + (offsets[i] ?? 1500)),
    source: feedId,
  }));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
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

// ── Speed comparison banner ────────────────────────────────────────────────

function SpeedBanner({ feeds, articles }: { feeds: FeedConfig[]; articles: Map<string, FeedArticle[]> }) {
  // For each story index, find which feed got it first
  const firstByStory: Map<number, string> = new Map();
  const latencyByFeed: Map<string, number[]> = new Map();

  STORY_BASE.forEach((_, i) => {
    let fastest: { feedId: string; ms: number } | null = null;
    feeds.forEach((f) => {
      const a = articles.get(f.id)?.[i];
      if (!a) return;
      const storyPublished =
        new Date(a.receivedAt).getTime() - (LATENCY_OFFSETS[f.id]?.[i] ?? 1500);
      const lag = new Date(a.receivedAt).getTime() - storyPublished;
      if (!fastest || lag < fastest.ms) fastest = { feedId: f.id, ms: lag };
    });
    if (fastest !== null) {
      const f = fastest as { feedId: string; ms: number };
      firstByStory.set(i, f.feedId);
      const arr = latencyByFeed.get(f.feedId) ?? [];
      arr.push(f.ms);
      latencyByFeed.set(f.feedId, arr);
    }
  });

  return (
    <div className="flex items-center gap-6 px-4 py-2 border-b border-border bg-panel shrink-0">
      <span className="text-muted text-[10px] uppercase tracking-wide">Speed Comparison (demo)</span>
      <div className="flex items-center gap-4">
        {feeds.map((f) => {
          const lats = LATENCY_OFFSETS[f.id] ?? [];
          const avg = lats.length > 0 ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null;
          const wins = [...firstByStory.values()].filter((id) => id === f.id).length;
          return (
            <div key={f.id} className="flex items-center gap-1.5">
              <span className={`text-[10px] font-semibold ${f.color}`}>{f.shortName}</span>
              {avg != null && (
                <span className="text-[10px] text-muted">
                  ~{avg < 1000 ? `${avg}ms` : `${(avg / 1000).toFixed(1)}s`}
                </span>
              )}
              {wins > 0 && (
                <span className="text-[9px] text-yellow-400">↑{wins}</span>
              )}
            </div>
          );
        })}
      </div>
      <span className="text-[10px] text-muted ml-auto italic">
        All data is simulated — connect API keys for live comparison
      </span>
    </div>
  );
}

// ── Single feed column ─────────────────────────────────────────────────────

function FeedColumn({
  feed,
  articles,
  liveCount,
}: {
  feed: FeedConfig;
  articles: FeedArticle[];
  liveCount?: number;
}) {
  const lats = LATENCY_OFFSETS[feed.id] ?? [];
  const avgMs = lats.length > 0
    ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length)
    : null;

  return (
    <div className="flex flex-col flex-1 min-w-0 border border-border rounded bg-panel overflow-hidden">
      {/* Feed header */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                feed.connected ? "bg-up" : "bg-muted"
              }`}
            />
            <span className={`text-xs font-semibold ${feed.color}`}>{feed.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {feed.connected && liveCount != null && (
              <span className="text-[10px] text-muted">{liveCount} live</span>
            )}
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                feed.connected
                  ? "bg-up/10 text-up border border-up/20"
                  : "bg-surface text-muted border border-border"
              }`}
            >
              {feed.connected ? "LIVE" : "DEMO"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[10px] text-muted truncate">{feed.description}</span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          {avgMs != null && (
            <span className="text-[10px] text-muted">
              Avg latency:{" "}
              <span className="text-white font-mono">
                {avgMs < 1000 ? `${avgMs}ms` : `${(avgMs / 1000).toFixed(2)}s`}
              </span>
            </span>
          )}
          {!feed.connected && feed.configKey && (
            <span className="text-[9px] text-muted font-mono bg-surface px-1 py-0.5 rounded">
              {feed.configKey}
            </span>
          )}
        </div>
      </div>

      {/* Articles */}
      <div className="overflow-y-auto flex-1">
        {articles.map((a) => (
          <div
            key={a.id}
            className="border-b border-border px-2.5 py-2 hover:bg-surface cursor-default"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-mono text-muted shrink-0">{fmtTime(a.receivedAt)}</span>
              <span className={`text-[10px] font-semibold shrink-0 ${feed.color}`}>{a.ticker}</span>
              <span className="text-[9px] text-muted shrink-0">{fmtAge(a.receivedAt)}</span>
            </div>
            <p className="text-white text-[11px] leading-snug line-clamp-2">{a.title}</p>
          </div>
        ))}
        {articles.length === 0 && (
          <div className="text-muted text-xs text-center py-6">No articles yet</div>
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
      if (next.has(id)) {
        if (next.size > 1) next.delete(id); // keep at least one
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Build articles map: for RTPR use live data, for others use dummy
  const articlesByFeed = useMemo(() => {
    const map = new Map<string, FeedArticle[]>();
    for (const feed of FEEDS) {
      if (feed.id === "rtpr") {
        map.set(
          "rtpr",
          liveArticles.map((a, i) => ({
            id: `rtpr-live-${i}`,
            ticker: a.ticker,
            title: a.title,
            receivedAt: a.receivedAt,
            source: "rtpr",
          }))
        );
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

      {/* Speed banner */}
      <SpeedBanner feeds={FEEDS} articles={articlesByFeed} />

      {/* Feed toggles */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-panel shrink-0">
        <span className="text-[10px] text-muted uppercase tracking-wide mr-1">Show:</span>
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
        <span className="ml-auto text-[10px] text-muted">
          {visibleFeeds.filter((f) => f.connected).length} connected ·{" "}
          {visibleFeeds.filter((f) => !f.connected).length} demo
        </span>
      </div>

      {/* Feed columns */}
      <div className="flex-1 flex gap-2 p-3 overflow-hidden">
        {visibleFeeds.map((feed) => (
          <FeedColumn
            key={feed.id}
            feed={feed}
            articles={articlesByFeed.get(feed.id) ?? []}
            liveCount={feed.id === "rtpr" ? liveArticles.length : undefined}
          />
        ))}
      </div>
    </div>
  );
}
