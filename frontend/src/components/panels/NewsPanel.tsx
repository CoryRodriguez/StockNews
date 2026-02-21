import { useNewsStore } from "../../store/newsStore";
import { useDashboardStore } from "../../store/dashboardStore";
import { useAudioAlert } from "../../hooks/useAudioAlert";
import { useEffect, useRef, useState } from "react";
import { NewsArticle } from "../../types";

function age(isoString: string) {
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

function NewsItem({
  article,
  onClick,
}: {
  article: NewsArticle;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ageMs = Date.now() - new Date(article.receivedAt).getTime();
  const isNew = ageMs < 2 * 60 * 1000; // < 2 minutes

  return (
    <div
      className="border-b border-border px-2 py-1.5 hover:bg-surface cursor-pointer"
      onClick={() => {
        onClick();
        setExpanded((v) => !v);
      }}
    >
      <div className="flex items-start gap-1.5">
        {isNew && (
          <span className="shrink-0 mt-0.5 bg-down text-white text-[9px] font-bold px-1 rounded leading-tight">
            NEW
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="text-accent text-xs font-semibold font-mono hover:underline"
            >
              {article.ticker}
            </button>
            <span className="text-muted text-[10px]">{age(article.receivedAt)}</span>
          </div>
          <p className="text-white text-xs leading-tight line-clamp-2">{article.title}</p>
          {expanded && article.body && (
            <p className="text-muted text-[11px] mt-1 leading-relaxed">{article.body}</p>
          )}
          <span className="text-muted text-[10px]">{article.author}</span>
        </div>
      </div>
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
            onClick={() => handleTickerClick(article.ticker)}
          />
        ))}
      </div>
    </div>
  );
}
