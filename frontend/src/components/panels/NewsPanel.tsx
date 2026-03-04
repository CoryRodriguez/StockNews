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
      className="shrink-0 flex items-center gap-px cursor-pointer hover:opacity-80 transition-opacity"
      title={isAiRated ? `AI: ${count}★ — click for analysis` : `${count}★ (keyword) — click for details`}
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
      className={`border-b border-border px-2 py-1.5 hover:bg-raised cursor-pointer ${
        tradeStatus ? "border-l-2 border-l-accent" : ""
      }`}
      onClick={() => {
        onTickerClick();
        setExpanded((v) => !v);
      }}
    >
      {/* Row 1: timestamp | stars | ticker | badges | read | + button */}
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
            onClick={handleReadClick}
            className="shrink-0 text-muted hover:text-white text-[10px] leading-none transition-colors"
            title="Read full article"
          >
            ◉
          </button>
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
