import { NewsArticle } from "../../types";
import { deriveStars } from "../../utils/newsUtils";

function StarRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted text-[10px] w-20 shrink-0">{label}</span>
      <span className="flex gap-px">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={`text-sm leading-none ${i < count ? color : "text-muted opacity-30"}`}
          >
            ★
          </span>
        ))}
      </span>
      <span className="text-muted text-[10px]">{count}/5</span>
    </div>
  );
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-green-900/50 text-green-300 border-green-600/40",
  medium: "bg-yellow-900/50 text-yellow-300 border-yellow-600/40",
  low: "bg-red-900/50 text-red-300 border-red-600/40",
};

export function AiAnalysisContent({ article }: { article: NewsArticle }) {
  const keywordStars = deriveStars(article.title);
  const hasAi = article.aiStars != null;

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

      {/* Star comparison */}
      <div className="bg-surface rounded p-3 space-y-2">
        <StarRow label="Keyword" count={keywordStars} color="text-yellow-400" />
        {hasAi ? (
          <StarRow label="AI Rating" count={article.aiStars!} color="text-accent" />
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-muted text-[10px] w-20 shrink-0">AI Rating</span>
            <span className="text-muted text-[10px] italic">Not analyzed</span>
          </div>
        )}
      </div>

      {/* Confidence badge */}
      {hasAi && article.aiConfidence && (
        <div className="flex items-center gap-2">
          <span className="text-muted text-[10px]">Confidence</span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
              CONFIDENCE_STYLES[article.aiConfidence] ?? CONFIDENCE_STYLES.medium
            }`}
          >
            {article.aiConfidence}
          </span>
        </div>
      )}

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
            This article has not been analyzed by AI.
            <br />
            <span className="text-[10px]">
              Articles matching configured AI keywords are automatically analyzed.
            </span>
          </div>
        )
      )}
    </div>
  );
}
