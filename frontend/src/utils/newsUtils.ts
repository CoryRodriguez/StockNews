// Keywords per tier — ordered from highest to lowest priority
const TIER_KEYWORDS: { tier: number; keywords: string[] }[] = [
  {
    tier: 5,
    keywords: [
      "acquisition", "acquired", "merger", "merging", "take-private",
      "buyout", "takeover", "go-private", "acquires",
    ],
  },
  {
    tier: 4,
    keywords: [
      "FDA", "approval", "approved", "NDA", "BLA", "PDUFA",
      "clinical trial", "Phase 2", "Phase 3", "Phase III", "Phase II",
      "breakthrough therapy", "fast track",
    ],
  },
  {
    tier: 3,
    keywords: [
      "earnings", "revenue", "EPS", "beat", "beats", "missed",
      "quarterly", "guidance", "raised guidance", "record revenue",
      "profit", "net income",
    ],
  },
  {
    tier: 2,
    keywords: [
      "contract", "awarded", "DoD", "government contract",
      "Department of Defense", "defense contract", "federal contract",
    ],
  },
];

// All highlight keywords (flattened, for rendering)
export const ALL_HIGHLIGHT_KEYWORDS: string[] = TIER_KEYWORDS.flatMap(
  (t) => t.keywords
);

/** Derive a 1-5 star rating from the article title */
export function deriveStars(title: string): number {
  const lower = title.toLowerCase();
  for (const { tier, keywords } of TIER_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) return tier;
  }
  return 1;
}

/** Split text into alternating plain/highlighted segments */
export function highlightKeywords(
  text: string
): { text: string; highlight: boolean }[] {
  if (!text) return [{ text: "", highlight: false }];

  // Build a single regex from all keywords, longest first to avoid partial matches
  const sorted = [...ALL_HIGHLIGHT_KEYWORDS].sort((a, b) => b.length - a.length);
  const pattern = sorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(`(${pattern})`, "gi");

  const parts: { text: string; highlight: boolean }[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index), highlight: false });
    }
    parts.push({ text: match[0], highlight: true });
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push({ text: text.slice(last), highlight: false });
  }

  return parts.length ? parts : [{ text, highlight: false }];
}

/** Format ISO timestamp as HH:MM:SS */
export function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}
