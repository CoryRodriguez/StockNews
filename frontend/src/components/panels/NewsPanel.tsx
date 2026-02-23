import { useNewsStore } from "../../store/newsStore";
import { useDashboardStore } from "../../store/dashboardStore";
import { useWatchlistStore } from "../../store/watchlistStore";
import { useAudioAlert } from "../../hooks/useAudioAlert";
import { useEffect, useRef, useState } from "react";
import { NewsArticle } from "../../types";
import { deriveStars, fmtTime, highlightKeywords } from "../../utils/newsUtils";

function Stars({ count }: { count: number }) {
  return (
    <span className="shrink-0 flex gap-px" title={`${count} star${count !== 1 ? "s" : ""}`}>
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

function NewsItem({
  article,
  onTickerClick,
}: {
  article: NewsArticle;
  onTickerClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stars = article.stars ?? deriveStars(article.title);
  const timestamp = fmtTime(article.receivedAt);
  const ageMs = Date.now() - new Date(article.receivedAt).getTime();
  const isNew = ageMs < 2 * 60 * 1000;

  const handleAddToWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    useWatchlistStore.getState().addTicker(article.ticker);
  };

  return (
    <div
      className="border-b border-border px-2 py-1.5 hover:bg-surface cursor-pointer"
      onClick={() => {
        onTickerClick();
        setExpanded((v) => !v);
      }}
    >
      {/* Row 1: timestamp | stars | ticker | NEW badge | + button */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-muted text-[10px] font-mono shrink-0">{timestamp}</span>
        <Stars count={stars} />
        <button
          onClick={(e) => { e.stopPropagation(); onTickerClick(); }}
          className="text-accent text-[11px] font-semibold font-mono hover:underline shrink-0"
        >
          {article.ticker}
        </button>
        {isNew && (
          <span className="shrink-0 bg-down text-white text-[9px] font-bold px-1 rounded leading-tight">
            NEW
          </span>
        )}
        <button
          onClick={handleAddToWatchlist}
          className="ml-auto shrink-0 text-accent text-sm font-bold leading-none hover:text-white transition-colors"
          title={`Add ${article.ticker} to watchlist`}
        >
          +
        </button>
      </div>

      {/* Row 2: news snippet with keyword highlights */}
      <HighlightedText
        text={article.title}
        className="text-white text-xs leading-tight line-clamp-2 block"
      />

      {/* Expanded body */}
      {expanded && article.body && (
        <HighlightedText
          text={article.body}
          className="text-muted text-[11px] mt-1 leading-relaxed block"
        />
      )}
    </div>
  );
}

interface Props {
  newsMode: "firehose" | "linked";
  title: string;
}

export function NewsPanel({ newsMode, title }: Props) {
  const { filteredArticles, setFilterTicker, filterTicker } = useNewsStore();
  const setActiveTicker = useDashboardStore((s) => s.setActiveTicker);
  const { alertNews } = useAudioAlert();
  const prevCountRef = useRef(0);

  const articles = newsMode === "linked" ? filteredArticles() : useNewsStore.getState().articles;

  // Audio alert on new articles
  useEffect(() => {
    const count = useNewsStore.getState().articles.length;
    if (count > prevCountRef.current && prevCountRef.current > 0) {
      alertNews();
    }
    prevCountRef.current = count;
  });

  const handleTickerClick = (ticker: string) => {
    setActiveTicker(ticker);
    setFilterTicker(ticker);
  };

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 border-b border-border shrink-0">
        <span className="text-white text-xs font-semibold">{title}</span>
        <div className="flex items-center gap-1">
          {filterTicker && newsMode === "linked" && (
            <button
              onClick={() => setFilterTicker(null)}
              className="text-muted hover:text-white text-[10px]"
            >
              {filterTicker} ✕
            </button>
          )}
          <span className="text-muted text-[10px]">{articles.length}</span>
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {articles.length === 0 && (
          <div className="text-muted text-xs text-center py-4">Waiting for news…</div>
        )}
        {articles.map((article, i) => (
          <NewsItem
            key={`${article.ticker}-${article.receivedAt}-${i}`}
            article={article}
            onTickerClick={() => handleTickerClick(article.ticker)}
          />
        ))}
      </div>
    </div>
  );
}
