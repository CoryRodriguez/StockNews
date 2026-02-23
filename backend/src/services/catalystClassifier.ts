/**
 * Granular catalyst classification
 *
 * Extends the tier system (tier1-4) with specific categories used by the
 * strategy engine.  The tier determines trade eligibility; the category
 * determines the optimal hold-time profile.
 */

export type CatalystCategory =
  | "MA_ACQUISITION"
  | "TENDER_OFFER"
  | "MERGER"
  | "GOING_PRIVATE"
  | "FDA_APPROVAL"
  | "FDA_BREAKTHROUGH"
  | "CLINICAL_TRIAL_SUCCESS"
  | "EARNINGS_BEAT"
  | "REVENUE_RECORD"
  | "GUIDANCE_RAISE"
  | "GOVERNMENT_CONTRACT"
  | "CONTRACT_AWARD"
  | "ANALYST_UPGRADE"
  | "PARTNERSHIP"
  | "PRODUCT_LAUNCH"
  | "STOCK_BUYBACK"
  | "OTHER";

interface CategoryRule {
  category: CatalystCategory;
  tier: number;
  patterns: (string | string[])[];
}

function match(lower: string, p: string | string[]): boolean {
  return Array.isArray(p) ? p.every((kw) => lower.includes(kw)) : lower.includes(p);
}

// Rules ordered from most specific to least specific.
// First match wins, so more specific compound patterns come first.
const RULES: CategoryRule[] = [
  // ── Tier 1: M&A ────────────────────────────────────
  {
    category: "TENDER_OFFER",
    tier: 1,
    patterns: ["tender offer"],
  },
  {
    category: "GOING_PRIVATE",
    tier: 1,
    patterns: ["going private", "take-private"],
  },
  {
    category: "MERGER",
    tier: 1,
    patterns: ["merger agreement", ["merger", "definitive"]],
  },
  {
    category: "MA_ACQUISITION",
    tier: 1,
    patterns: [
      ["agree", "acqui"],
      ["buyout", "per share"],
      ["acquisition", "billion"],
      ["acquisition", "million"],
      "definitive agreement",
      "all-cash",
    ],
  },

  // ── Tier 2: FDA / Clinical ─────────────────────────
  {
    category: "FDA_BREAKTHROUGH",
    tier: 2,
    patterns: ["breakthrough therapy designation"],
  },
  {
    category: "FDA_APPROVAL",
    tier: 2,
    patterns: [
      ["fda", "approv"],
      ["pdufa", "approv"],
      ["nda", "approv"],
      ["bla", "approv"],
    ],
  },
  {
    category: "CLINICAL_TRIAL_SUCCESS",
    tier: 2,
    patterns: [
      ["phase 3", "met"],
      ["phase iii", "met"],
      ["phase 3", "positive"],
      ["phase iii", "positive"],
      ["phase 3", "success"],
      ["phase iii", "success"],
      ["phase 2", "positive"],
      ["phase ii", "positive"],
      ["primary endpoint", "met"],
    ],
  },

  // ── Tier 3: Earnings ───────────────────────────────
  {
    category: "GUIDANCE_RAISE",
    tier: 3,
    patterns: [
      ["guidance", "raise"],
      ["guidance", "increase"],
      ["outlook", "raise"],
      ["forecast", "raise"],
    ],
  },
  {
    category: "REVENUE_RECORD",
    tier: 3,
    patterns: [
      ["record", "quarter"],
      ["record", "revenue"],
      ["revenue", "exceeds"],
    ],
  },
  {
    category: "EARNINGS_BEAT",
    tier: 3,
    patterns: [
      "earnings beat",
      ["beats", "estimates"],
      ["eps", "beat"],
      ["beats", "guidance raised"],
      ["beat", "guidance raised"],
    ],
  },

  // ── Tier 4: Contracts ──────────────────────────────
  {
    category: "GOVERNMENT_CONTRACT",
    tier: 4,
    patterns: [
      ["contract", "dod"],
      ["contract", "defense"],
      ["contract", "department of defense"],
      "government contract",
    ],
  },
  {
    category: "CONTRACT_AWARD",
    tier: 4,
    patterns: [
      ["awarded", "million"],
      ["awarded", "billion"],
      ["contract", "award"],
    ],
  },

  // ── Additional categories (tier 4 / uncategorized) ─
  {
    category: "ANALYST_UPGRADE",
    tier: 4,
    patterns: [
      ["upgrade", "buy"],
      ["upgrade", "outperform"],
      ["price target", "raise"],
      ["initiates", "buy"],
      ["initiates", "overweight"],
    ],
  },
  {
    category: "PARTNERSHIP",
    tier: 4,
    patterns: [
      ["partnership", "agreement"],
      ["collaboration", "agreement"],
      ["strategic", "alliance"],
      ["license", "agreement"],
    ],
  },
  {
    category: "PRODUCT_LAUNCH",
    tier: 4,
    patterns: [
      ["launch", "product"],
      ["launch", "platform"],
      ["introduces", "new"],
      ["unveils", "new"],
    ],
  },
  {
    category: "STOCK_BUYBACK",
    tier: 4,
    patterns: [
      "share repurchase",
      "stock buyback",
      ["buyback", "program"],
      ["repurchase", "program"],
    ],
  },
];

export interface CatalystClassification {
  category: CatalystCategory;
  tier: number;
}

/**
 * Classify a news headline + optional body into a granular catalyst category.
 * Returns null if a danger pattern matches (same as the original classifyCatalyst).
 */
export function classifyCatalystGranular(
  headline: string,
  body?: string
): CatalystClassification | null {
  const text = body ? `${headline} ${body}` : headline;
  const lower = text.toLowerCase();

  // Danger patterns — must stay in sync with paperTrader.ts DANGER list
  if (isDangerPattern(lower)) return null;

  for (const rule of RULES) {
    if (rule.patterns.some((p) => match(lower, p))) {
      return { category: rule.category, tier: rule.tier };
    }
  }

  return { category: "OTHER", tier: 5 };
}

function isDangerPattern(lower: string): boolean {
  const DANGER: (string | string[])[] = [
    "complete response letter",
    ["guidance", "cut"],
    ["guidance", "lower"],
    ["guidance", "reduce"],
    ["offering", "shares"],
    "dilution",
    ["medicare", "rate", "below"],
    "going concern",
    ["fda", "reject"],
    ["fda", "refuse"],
    ["fda", "not approv"],
  ];
  return DANGER.some((p) => match(lower, p));
}

// ── Market context helpers ─────────────────────────────────────────────────

export type CapBucket = "NANO" | "MICRO" | "SMALL" | "MID" | "LARGE" | "ALL";
export type TodBucket = "PRE_MARKET" | "MARKET_OPEN" | "MID_DAY" | "POWER_HOUR" | "AFTER_HOURS" | "ALL";

export function getCapBucket(marketCap: number | null): CapBucket {
  if (marketCap == null) return "ALL";
  if (marketCap < 50_000_000) return "NANO";
  if (marketCap < 300_000_000) return "MICRO";
  if (marketCap < 2_000_000_000) return "SMALL";
  if (marketCap < 10_000_000_000) return "MID";
  return "LARGE";
}

/** Determine time-of-day bucket based on ET (UTC-5 / UTC-4 DST). */
export function getTodBucket(date: Date): TodBucket {
  // Approximate ET offset: use -5 (EST). Not perfect for DST but close enough.
  const utcHour = date.getUTCHours();
  const etHour = (utcHour - 5 + 24) % 24;
  const etMin = date.getUTCMinutes();
  const etTime = etHour * 60 + etMin;

  if (etTime < 570) return "PRE_MARKET";       // before 9:30
  if (etTime < 630) return "MARKET_OPEN";       // 9:30 - 10:30
  if (etTime < 900) return "MID_DAY";           // 10:30 - 15:00
  if (etTime < 960) return "POWER_HOUR";        // 15:00 - 16:00
  return "AFTER_HOURS";                          // 16:00+
}

/** Returns true if the given time is outside regular market hours (9:30-16:00 ET). */
export function isPreMarket(date: Date): boolean {
  const bucket = getTodBucket(date);
  return bucket === "PRE_MARKET" || bucket === "AFTER_HOURS";
}
