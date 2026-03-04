import { NewsArticle } from "../../types";
import { deriveStars } from "../../utils/newsUtils";

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-green-900/50 text-green-300 border-green-600/40",
  medium: "bg-yellow-900/50 text-yellow-300 border-yellow-600/40",
  low: "bg-red-900/50 text-red-300 border-red-600/40",
};

export function AiAnalysisContent({ article }: { article: NewsArticle }) {
  const hasAi = article.aiStars != null;
  const displayStars = article.aiStars ?? deriveStars(article.title);

  return (
    <div className="space-y-4">
      {/* Article info */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-accent text-xs font-semibold font-mono">{article.ticker}</span>
          <span className="text-muted text-[10px]">{article.source}</span>
        </div>
        <div className="text-white text-xs leading-tight">{article.title}</div>
      </div>

      {/* Star rating */}
      <div className="bg-surface rounded p-3">
        <div className="flex items-center gap-3">
          <span className="flex gap-px">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className={`text-lg leading-none ${
                  i < displayStars
                    ? hasAi ? "text-accent" : "text-accent/40"
                    : "text-muted opacity-30"
                }`}
              >
                ★
              </span>
            ))}
          </span>
          <span className="text-white text-sm font-semibold">{displayStars}/5</span>
          {hasAi && article.aiConfidence && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                CONFIDENCE_STYLES[article.aiConfidence] ?? CONFIDENCE_STYLES.medium
              }`}
            >
              {article.aiConfidence}
            </span>
          )}
          {!hasAi && (
            <span className="text-[10px] text-muted italic">Pending AI analysis</span>
          )}
        </div>
      </div>

      {/* Analysis text */}
      {hasAi && article.aiAnalysis ? (
        <div>
          <div className="text-muted text-[10px] mb-1 uppercase tracking-wide">Analysis</div>
          <div className="text-white text-xs leading-relaxed bg-surface rounded p-3">
            {article.aiAnalysis}
          </div>
        </div>
      ) : (
        !hasAi && (
          <div className="text-muted text-xs text-center py-2 bg-surface rounded">
            AI analysis is pending for this article.
            <br />
            <span className="text-[10px]">
              Articles with catalyst keywords are automatically analyzed.
            </span>
          </div>
        )
      )}
    </div>
  );
}
