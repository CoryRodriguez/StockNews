import { useState } from "react";
import DOMPurify from "dompurify";
import { NewsArticle } from "../../types";
import { highlightKeywords, fmtTime } from "../../utils/newsUtils";
import { useAuthStore } from "../../store/authStore";
import { useCatalystStore } from "../../store/catalystStore";

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
  const token = useAuthStore((s) => s.token);
  const prependUserArticle = useCatalystStore((s) => s.prependUserArticle);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleAddToCatalyst = async () => {
    if (!token || submitting || submitted) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/catalyst/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticker: article.ticker,
          title: article.title,
          body: article.body,
          url: article.url || undefined,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        prependUserArticle(created);
        setSubmitted(true);
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  };

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

      {/* Footer row */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        {article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent text-xs hover:underline"
          >
            Read original article →
          </a>
        ) : (
          <div />
        )}
        <button
          onClick={handleAddToCatalyst}
          disabled={submitting || submitted}
          className={`text-[11px] font-medium px-3 py-1.5 rounded transition-colors ${
            submitted
              ? "bg-green-soft text-up border border-green-600/30"
              : "bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25"
          } disabled:cursor-not-allowed`}
        >
          {submitted ? "Added to Catalyst" : submitting ? "Adding…" : "Add to Catalyst"}
        </button>
      </div>
    </div>
  );
}
