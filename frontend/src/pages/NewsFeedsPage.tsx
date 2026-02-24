/**
 * News Feeds Page
 *
 * Side-by-side comparison of multiple news feed providers.
 * All feeds display the same STORY_BASE articles with simulated latency
 * offsets so you can visually compare who received each story first.
 * Each article shows a colored rank badge (1st · fastest, 2nd · +280ms, …)
 */
import { useMemo, useState } from "react";
import { TopNav } from "../components/layout/TopNav";
import { useNewsStore } from "../store/newsStore";

// ── Types ──────────────────────────────────────────────────────────────────

interface FeedArticle {
  id: string;
  ticker: string;
  title: string;
  receivedAt: string;
  source: string;
  storyIdx: number; // index in STORY_BASE — used for cross-feed matching
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
    name: "Benzinga Pro",
    shortName: "BZG",
    description: "High-speed financial news and real-time analysis.",
    connected: false,
    configKey: "BENZINGA_API_KEY",
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

// ── Shared story base ──────────────────────────────────────────────────────
// All feeds deliver these same stories. Latency offsets simulate how fast
// each provider picks up and distributes the news.

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

// Simulated milliseconds after publication each feed receives each story.
// Lower = faster feed.
const LATENCY_OFFSETS: Record<string, number[]> = {
  rtpr:         [ 820,  1250,  650,  980, 1100,  720,  880, 1400,  590,  760,  910, 1050],
  benzinga:     [1100,  1450,  920, 1200, 1380, 1050, 1240, 1700,  880, 1020, 1180, 1350],
  dowjones:     [ 950,  1380,  810, 1100, 1220,  900, 1010, 1550,  720,  910, 1040, 1200],
  globe:        [2200,  2750, 1980, 2400, 2600, 2100, 2350, 3100, 1850, 2150, 2480, 2750],
  businesswire: [2850,  3400, 2600, 3100, 3300, 2750, 3050, 3800, 2400, 2780, 3200, 3500],
};

const _now = Date.now();
const ago = (ms: number) => new Date(_now - ms).toISOString();

function buildDummyArticles(feedId: string): FeedArticle[] {
  const offsets = LATENCY_OFFSETS[feedId] ?? [];
  return STORY_BASE.map((s, i) => ({
    id: `${feedId}-${i}`,
    ticker: s.ticker,
    title: s.title,
    // Stories published every ~4-6 minutes, feed receives at its offset lag
    receivedAt: ago((STORY_BASE.length - i) * 5 * 60_000 + (offsets[i] ?? 1500)),
    source: feedId,
    storyIdx: i,
  }));
}

// ── Rank helpers ───────────────────────────────────────────────────────────

const RANK_LABELS = ["", "1st", "2nd", "3rd", "4th", "5th"];
const RANK_STYLES = [
  "",
  // 1st — gold
  "bg-yellow-400/20 text-yellow-300 border-yellow-500/40",
  // 2nd — silver
  "bg-slate-400/15 text-slate-300 border-slate-500/40",
  // 3rd — bronze
  "bg-amber-700/20 text-amber-500 border-amber-800/40",
  // 4th+ — muted
  "bg-surface text-muted border-border",
  "bg-surface text-muted border-border",
];

function fmtDelta(ms: number): string {
  if (ms === 0) return "fastest";
  if (ms < 1000) return `+${ms}ms`;
  return `+${(ms / 1000).toFixed(2)}s`;
}

function RankBadge({ rank, deltaMs }: { rank: number; deltaMs: number }) {
  const style = RANK_STYLES[Math.min(rank, RANK_STYLES.length - 1)];
  const label = RANK_LABELS[Math.min(rank, RANK_LABELS.length - 1)] ?? `${rank}th`;
  return (
    <span className={`shrink-0 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${style}`}>
      {label} · {fmtDelta(deltaMs)}
    </span>
  );
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

// ── Speed banner ──────────────────────────────────────────────────────────

function SpeedBanner({
  feeds,
  articlesByFeed,
}: {
  feeds: FeedConfig[];
  articlesByFeed: Map<string, FeedArticle[]>;
}) {
  // Count how many stories each feed won (was first to receive)
  const wins = new Map<string, number>();

  for (let i = 0; i < STORY_BASE.length; i++) {
    const arrivals = feeds
      .map((f) => {
        const a = articlesByFeed.get(f.id)?.find((x) => x.storyIdx === i);
        return a ? { feedId: f.id, t: new Date(a.receivedAt).getTime() } : null;
      })
      .filter(Boolean) as { feedId: string; t: number }[];
    arrivals.sort((a, b) => a.t - b.t);
    if (arrivals[0]) wins.set(arrivals[0].feedId, (wins.get(arrivals[0].feedId) ?? 0) + 1);
  }

  return (
    <div className="flex items-center gap-6 px-4 py-2 border-b border-border bg-panel shrink-0 overflow-x-auto">
      <span className="text-muted text-[10px] uppercase tracking-wide whitespace-nowrap">Speed (demo)</span>
      <div className="flex items-center gap-5">
        {feeds.map((f) => {
          const lats = LATENCY_OFFSETS[f.id] ?? [];
          const avg = lats.length
            ? Math.round(lats.reduce((a, b) => a + b) / lats.length)
            : null;
          const w = wins.get(f.id) ?? 0;
          return (
            <div key={f.id} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className={`text-[10px] font-semibold ${f.color}`}>{f.shortName}</span>
              {avg != null && (
                <span className="text-[10px] text-muted font-mono">
                  {avg < 1000 ? `${avg}ms` : `${(avg / 1000).toFixed(2)}s`}
                </span>
              )}
              {w > 0 && (
                <span className="text-[9px] text-yellow-400 font-bold">↑{w}</span>
              )}
            </div>
          );
        })}
      </div>
      <span className="text-[10px] text-muted ml-auto italic whitespace-nowrap">
        Simulated latency — connect API keys for live comparison
      </span>
    </div>
  );
}

// ── Single feed column ─────────────────────────────────────────────────────

function FeedColumn({
  feed,
  articles,
  liveCount,
  getRank,
}: {
  feed: FeedConfig;
  articles: FeedArticle[];
  liveCount?: number;
  getRank: (storyIdx: number) => { rank: number; deltaMs: number } | null;
}) {
  const lats = LATENCY_OFFSETS[feed.id] ?? [];
  const avgMs = lats.length
    ? Math.round(lats.reduce((a, b) => a + b) / lats.length)
    : null;

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
            {feed.connected && liveCount != null && liveCount > 0 && (
              <span className="text-[10px] text-muted">{liveCount} live</span>
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
        <div className="flex items-center gap-3 mt-1">
          {avgMs != null && (
            <span className="text-[10px] text-muted">
              Avg:{" "}
              <span className="text-white font-mono">
                {avgMs < 1000 ? `${avgMs}ms` : `${(avgMs / 1000).toFixed(2)}s`}
              </span>
            </span>
          )}
          {!feed.connected && feed.configKey && (
            <span className="text-[9px] text-muted font-mono bg-surface px-1 py-0.5 rounded border border-border">
              {feed.configKey}
            </span>
          )}
        </div>
      </div>

      {/* Articles */}
      <div className="overflow-y-auto flex-1">
        {articles.map((a) => {
          const rankInfo = getRank(a.storyIdx);
          return (
            <div
              key={a.id}
              className="border-b border-border px-2.5 py-2 hover:bg-surface"
            >
              {/* Row 1: time · ticker · age · rank badge */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-mono text-muted shrink-0">
                  {fmtTime(a.receivedAt)}
                </span>
                <span className={`text-[10px] font-semibold shrink-0 ${feed.color}`}>
                  {a.ticker}
                </span>
                <span className="text-[9px] text-muted shrink-0">{fmtAge(a.receivedAt)}</span>
                {rankInfo && (
                  <div className="ml-auto">
                    <RankBadge rank={rankInfo.rank} deltaMs={rankInfo.deltaMs} />
                  </div>
                )}
              </div>
              {/* Row 2: headline */}
              <p className="text-white text-[11px] leading-snug line-clamp-2">{a.title}</p>
            </div>
          );
        })}
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
      if (next.has(id) && next.size > 1) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // All feeds use demo data for the speed comparison grid.
  // RTPR live article count is shown in the header but doesn't affect ranking.
  const articlesByFeed = useMemo(() => {
    const map = new Map<string, FeedArticle[]>();
    for (const feed of FEEDS) {
      map.set(feed.id, buildDummyArticles(feed.id));
    }
    return map;
  }, []);

  // Build rank map: for each story, sort feeds by receivedAt and assign rank.
  // Computed across ALL feeds (not just visible) so ranks are globally stable.
  const storyRankMap = useMemo(() => {
    const map = new Map<string, { rank: number; deltaMs: number }>();

    for (let i = 0; i < STORY_BASE.length; i++) {
      const arrivals: { feedId: string; timeMs: number }[] = [];

      for (const feed of FEEDS) {
        const a = articlesByFeed.get(feed.id)?.find((x) => x.storyIdx === i);
        if (a) arrivals.push({ feedId: feed.id, timeMs: new Date(a.receivedAt).getTime() });
      }

      arrivals.sort((a, b) => a.timeMs - b.timeMs);
      const firstTime = arrivals[0]?.timeMs ?? 0;

      arrivals.forEach(({ feedId, timeMs }, idx) => {
        map.set(`${feedId}-${i}`, { rank: idx + 1, deltaMs: timeMs - firstTime });
      });
    }

    return map;
  }, [articlesByFeed]);

  const visibleFeeds = FEEDS.filter((f) => selectedFeeds.has(f.id));

  return (
    <div className="h-screen w-screen flex flex-col bg-surface overflow-hidden font-mono">
      <TopNav />

      {/* Speed comparison banner */}
      <SpeedBanner feeds={FEEDS} articlesByFeed={articlesByFeed} />

      {/* Rank legend + feed toggles */}
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

        {/* Rank legend */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted">Rank:</span>
          {[
            { label: "1st", style: "bg-yellow-400/20 text-yellow-300 border-yellow-500/40" },
            { label: "2nd", style: "bg-slate-400/15 text-slate-300 border-slate-500/40" },
            { label: "3rd", style: "bg-amber-700/20 text-amber-500 border-amber-800/40" },
            { label: "4th+", style: "bg-surface text-muted border-border" },
          ].map(({ label, style }) => (
            <span key={label} className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${style}`}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Feed columns */}
      <div className="flex-1 flex gap-2 p-3 overflow-hidden min-h-0">
        {visibleFeeds.map((feed) => (
          <FeedColumn
            key={feed.id}
            feed={feed}
            articles={articlesByFeed.get(feed.id) ?? []}
            liveCount={feed.id === "rtpr" ? liveArticles.length : undefined}
            getRank={(storyIdx) => storyRankMap.get(`${feed.id}-${storyIdx}`) ?? null}
          />
        ))}
      </div>
    </div>
  );
}
