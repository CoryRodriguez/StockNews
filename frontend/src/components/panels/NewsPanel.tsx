import { useNewsStore } from "../../store/newsStore";
import { useDashboardStore } from "../../store/dashboardStore";
import { useWatchlistStore } from "../../store/watchlistStore";
import { useTradesStore } from "../../store/tradesStore";
import { useAuthStore } from "../../store/authStore";
import { useAudioAlert } from "../../hooks/useAudioAlert";
import { useHourlyChanges } from "../../hooks/useHourlyChanges";
import { useEffect, useMemo, useRef, useState } from "react";
import { NewsArticle } from "../../types";
import { deriveStars, fmtTime, highlightKeywords } from "../../utils/newsUtils";
import { Modal } from "../ui/Modal";
import { AiAnalysisContent } from "../modals/AiAnalysisContent";
import { ArticleContent } from "../modals/ArticleContent";

function Stars({ count, isAiRated, onClick }: { count: number; isAiRated: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-px cursor-pointer hover:brightness-200 hover:drop-shadow-[0_0_4px_rgba(76,141,202,0.6)] transition-all duration-150"
      title={`${count}★ — click for details`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-[9px] leading-none ${
            i < count
              ? isAiRated ? "text-accent" : "text-accent/40"
              : "text-muted opacity-30"
          }`}
        >
          ★
        </span>
      ))}
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

function NewsItem({
  article,
  onTickerClick,
  tradeStatus,
  hourChangePct,
}: {
  article: NewsArticle;
  onTickerClick: () => void;
  tradeStatus: "open" | "closed" | null;
  hourChangePct?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const token = useAuthStore((s) => s.token);
  const openModal = useNewsStore((s) => s.openModal);
  const displayStars = article.aiStars ?? article.stars ?? deriveStars(article.title);
  const isAiRated = article.aiStars != null;
  const timestamp = fmtTime(article.receivedAt);
  const ageMs = Date.now() - new Date(article.receivedAt).getTime();
  const isNew = ageMs < 2 * 60 * 1000;

  const handleAddToWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    useWatchlistStore.getState().addTicker(article.ticker, token ?? undefined);
  };

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openModal(article, "ai");
  };

  const handleReadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openModal(article, "article");
  };

  return (
    <div
      className={`relative border-b border-border px-2 py-1.5 hover:bg-raised cursor-pointer ${
        tradeStatus ? "border-l-2 border-l-accent" : ""
      }`}
      onClick={() => {
        onTickerClick();
        setExpanded((v) => !v);
      }}
    >
      {/* Row 1: timestamp | stars | ticker | badges | + button */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-muted text-[10px] font-mono shrink-0">{timestamp}</span>
        <Stars count={displayStars} isAiRated={isAiRated} onClick={handleStarClick} />
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
        {tradeStatus === "open" && (
          <span className="shrink-0 bg-blue-soft text-accent text-[9px] font-bold px-1 rounded leading-tight border border-accent/40">
            HOLDING
          </span>
        )}
        {tradeStatus === "closed" && (
          <span className="shrink-0 bg-accent/20 text-accent text-[9px] font-bold px-1 rounded leading-tight border border-accent/40">
            TRADED
          </span>
        )}
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
          <button
            onClick={handleAddToWatchlist}
            className="shrink-0 text-accent text-sm font-bold leading-none hover:text-white transition-colors"
            title={`Add ${article.ticker} to watchlist`}
          >
            +
          </button>
        </div>
      </div>

      {/* Row 2: news snippet with keyword highlights */}
      <HighlightedText
        text={article.title}
        className="text-white text-xs leading-tight line-clamp-2 block pr-5"
      />

      {/* Expanded body */}
      {expanded && article.body && (
        <HighlightedText
          text={article.body}
          className="text-muted text-[11px] mt-1 leading-relaxed block pr-5"
        />
      )}

      {/* Open article modal — bottom right */}
      <button
        onClick={handleReadClick}
        className="absolute bottom-1.5 right-2 text-muted hover:text-white transition-colors"
        title="Read full article"
      >
        <svg width="12" height="12" viewBox="0 0 512 512" fill="currentColor">
          <path d="M352 0c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9L370.7 96 201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L416 141.3l41.4 41.4c9.2 9.2 22.9 11.9 34.9 6.9s19.8-16.6 19.8-29.6V32c0-17.7-14.3-32-32-32H352zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32V432c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16H192c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z"/>
        </svg>
      </button>
    </div>
  );
}

interface Props {
  newsMode: "firehose" | "linked";
  title: string;
}

export function NewsPanel({ newsMode, title }: Props) {
  const { filteredArticles, setFilterTicker, filterTicker, modalArticle, modalType, closeModal } = useNewsStore();
  const allArticles = useNewsStore((s) => s.articles);
  const setActiveTicker = useDashboardStore((s) => s.setActiveTicker);
  const { alertNews } = useAudioAlert();
  const trades = useTradesStore((s) => s.trades);
  const prevCountRef = useRef(0);

  const articles = newsMode === "linked" ? filteredArticles() : allArticles;

  const tickers = useMemo(() => [...new Set(articles.map((a) => a.ticker))], [articles]);
  const hourlyChanges = useHourlyChanges(tickers);

  // Build a map of ticker -> trade status for badge display
  const tradedTickers = useMemo(() => {
    const map = new Map<string, "open" | "closed">();
    for (const t of trades) {
      const isOpen =
        t.buyStatus === "filled" &&
        (t.sellStatus === "awaiting" || t.sellStatus === "pending");
      const isClosed = t.sellStatus === "filled";
      // "open" takes priority if a position is currently held
      if (isOpen) {
        map.set(t.ticker, "open");
      } else if (isClosed && map.get(t.ticker) !== "open") {
        map.set(t.ticker, "closed");
      }
    }
    return map;
  }, [trades]);

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
            tradeStatus={tradedTickers.get(article.ticker) ?? null}
            hourChangePct={hourlyChanges[article.ticker]}
          />
        ))}
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
