import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import { useCatalystStore, type UserArticle } from "../../store/catalystStore";

// ── Helpers ──────────────────────────────────────────────────────────────

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function timeFmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Component ────────────────────────────────────────────────────────────

export function UserArticlesPanel() {
  const token = useAuthStore((s) => s.token);
  const { userArticles, setUserArticles, prependUserArticle, removeUserArticle } =
    useCatalystStore();
  const [loading, setLoading] = useState(true);

  // Form state
  const [ticker, setTicker] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch articles
  useEffect(() => {
    if (!token) return;
    fetch("/api/catalyst/articles?limit=50", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setUserArticles(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, setUserArticles]);

  // Submit
  const handleSubmit = async () => {
    if (!ticker.trim() || !title.trim() || !body.trim() || !token) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/catalyst/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        const article = await res.json();
        prependUserArticle(article);
        setTicker("");
        setTitle("");
        setBody("");
        setUrl("");
        setNotes("");
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`/api/catalyst/articles/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      removeUserArticle(id);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-xs font-semibold text-white tracking-wide uppercase">
          User Submitted Articles
        </h2>
      </div>

      {/* Submit form */}
      <div className="px-4 py-3 border-b border-border bg-surface">
        <div className="grid grid-cols-[100px_1fr] gap-2 mb-2">
          <input
            type="text"
            placeholder="TICKER"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase().slice(0, 10))}
            className="bg-panel border border-border rounded px-2 py-1.5 text-xs font-mono text-white placeholder:text-muted/50 focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            placeholder="Article title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-panel border border-border rounded px-2 py-1.5 text-xs text-white placeholder:text-muted/50 focus:outline-none focus:border-accent"
          />
        </div>
        <textarea
          placeholder="Article body / content..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-white placeholder:text-muted/50 focus:outline-none focus:border-accent resize-none mb-2"
        />
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            type="text"
            placeholder="URL (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="bg-panel border border-border rounded px-2 py-1.5 text-xs text-white placeholder:text-muted/50 focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-panel border border-border rounded px-2 py-1.5 text-xs text-white placeholder:text-muted/50 focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !ticker.trim() || !title.trim() || !body.trim()}
            className="px-4 py-1.5 bg-accent text-white text-xs font-medium rounded hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Analyzing…" : "Submit"}
          </button>
        </div>
      </div>

      {/* Articles list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-muted text-xs font-mono">Loading…</span>
          </div>
        ) : userArticles.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-muted text-xs font-mono">No articles submitted yet</span>
          </div>
        ) : (
          userArticles.map((a) => <ArticleCard key={a.id} article={a} onDelete={handleDelete} />)
        )}
      </div>
    </div>
  );
}

// ── Article card ─────────────────────────────────────────────────────────

function ArticleCard({
  article: a,
  onDelete,
}: {
  article: UserArticle;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-4 py-3 border-b border-border/30 hover:bg-surface/50 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-white font-mono font-semibold text-xs">{a.ticker}</span>
        {a.aiStars != null && (
          <span className="text-yellow-400 text-[10px] font-mono tracking-tight">
            {stars(a.aiStars)}
          </span>
        )}
        {a.aiConfidence && (
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
              a.aiConfidence === "high"
                ? "bg-green-soft text-up"
                : a.aiConfidence === "medium"
                ? "bg-blue-soft text-accent"
                : "bg-red-soft text-down"
            }`}
          >
            {a.aiConfidence}
          </span>
        )}
        <span className="ml-auto text-[9px] text-muted font-mono">{timeFmt(a.createdAt)}</span>
        <button
          onClick={() => onDelete(a.id)}
          className="text-[9px] text-muted hover:text-down transition-colors ml-1"
          title="Delete"
        >
          ✕
        </button>
      </div>

      <p
        className="text-[11px] text-white/80 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {a.title}
      </p>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[10px] text-muted/70 whitespace-pre-wrap line-clamp-6">{a.body}</p>
          {a.url && (
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-accent hover:underline"
            >
              {a.url}
            </a>
          )}
          {a.notes && (
            <p className="text-[10px] text-warn italic">Notes: {a.notes}</p>
          )}
        </div>
      )}

      {a.aiAnalysis && (
        <p className="text-[10px] text-muted/70 mt-1 line-clamp-2">{a.aiAnalysis}</p>
      )}
      {!a.aiStars && (
        <p className="text-[10px] text-muted/50 mt-1 italic">AI analysis pending…</p>
      )}
    </div>
  );
}
