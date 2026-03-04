import DOMPurify from "dompurify";
import { NewsArticle } from "../../types";
import { highlightKeywords, fmtTime } from "../../utils/newsUtils";

function HighlightedBlock({ text, className }: { text: string; className?: string }) {
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

export function ArticleContent({ article }: { article: NewsArticle }) {
  return (
    <div className="space-y-4">
      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-accent text-xs font-semibold font-mono">{article.ticker}</span>
        <span className="text-muted text-[10px]">{article.source}</span>
        <span className="text-muted text-[10px] font-mono">{fmtTime(article.receivedAt)}</span>
        {article.author && (
          <span className="text-muted text-[10px]">by {article.author}</span>
        )}
      </div>

      {/* Title */}
      <HighlightedBlock
        text={article.title}
        className="text-white text-sm font-semibold leading-tight block"
      />

      {/* Body */}
      {article.body ? (
        <div
          className="text-white/90 text-xs leading-relaxed max-w-none [&_a]:text-accent [&_a]:underline [&_p]:mb-2 [&_br+br]:hidden [&_div]:mb-1"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.body) }}
        />
      ) : (
        <div className="text-muted text-xs italic">No article body available.</div>
      )}

      {/* Source link */}
      {article.url && (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-accent text-xs hover:underline"
        >
          Read original article →
        </a>
      )}
    </div>
  );
}
