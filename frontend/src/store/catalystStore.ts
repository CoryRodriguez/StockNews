import { create } from "zustand";

// ── Types ────────────────────────────────────────────────────────────────

export interface KeywordHit {
  id: string;
  ticker: string;
  headline: string;
  source: string;
  matchedKeyword: string | null;
  catalystCategory: string | null;
  catalystTier: number | null;
  aiStars: number;
  aiAnalysis: string;
  aiConfidence: string;
  priceAtNews: number | null;
  price1h: number | null;
  price4h: number | null;
  priceEod: number | null;
  return1hPct: number | null;
  return4hPct: number | null;
  returnEodPct: number | null;
  createdAt: string;
}

export interface KeywordSummary {
  catalystCategory: string;
  _count: { id: number };
  _avg: {
    aiStars: number | null;
    return1hPct: number | null;
    return4hPct: number | null;
    returnEodPct: number | null;
  };
}

export interface CategoryStat {
  catalystCategory: string;
  hitCount: number;
  avgStars: number;
  avgReturn1h: number;
  avgReturn4h: number;
  avgReturnEod: number;
  winRate: number;
}

export interface UserArticle {
  id: string;
  ticker: string;
  title: string;
  body: string;
  url: string | null;
  notes: string | null;
  aiStars: number | null;
  aiAnalysis: string | null;
  aiConfidence: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MoverEntry {
  ticker: string;
  changePct: number;
  volume: number;
  relVol: number;
  priceOpen: number;
  priceClose: number;
}

export interface TrendingKeyword {
  keyword: string;
  count: number;
  avgChangePct: number;
  tickers: string[];
}

export interface MoverAnalysis {
  id: string;
  date: string;
  moversJson: MoverEntry[];
  trendingKeywords: TrendingKeyword[];
  aiSummary: string;
  computedAt: string;
}

export type CatalystTab = "keywords" | "articles" | "movers";

// ── Store ────────────────────────────────────────────────────────────────

interface CatalystState {
  activeTab: CatalystTab;
  setActiveTab: (tab: CatalystTab) => void;

  // Keywords
  keywordSummary: KeywordSummary[];
  categoryStats: CategoryStat[];
  recentHits: KeywordHit[];
  setKeywordData: (summary: KeywordSummary[], recent: KeywordHit[]) => void;
  setCategoryStats: (stats: CategoryStat[]) => void;
  prependHit: (hit: KeywordHit) => void;

  // User articles
  userArticles: UserArticle[];
  setUserArticles: (articles: UserArticle[]) => void;
  prependUserArticle: (article: UserArticle) => void;
  updateUserArticle: (article: UserArticle) => void;
  removeUserArticle: (id: string) => void;

  // Movers
  moverAnalysis: MoverAnalysis | null;
  moverSelectedDate: string;
  moverHistory: { date: string; computedAt: string }[];
  setMoverAnalysis: (analysis: MoverAnalysis | null) => void;
  setMoverSelectedDate: (date: string) => void;
  setMoverHistory: (history: { date: string; computedAt: string }[]) => void;
}

export const useCatalystStore = create<CatalystState>((set) => ({
  activeTab: "keywords",
  setActiveTab: (tab) => set({ activeTab: tab }),

  keywordSummary: [],
  categoryStats: [],
  recentHits: [],
  setKeywordData: (summary, recent) => set({ keywordSummary: summary, recentHits: recent }),
  setCategoryStats: (stats) => set({ categoryStats: stats }),
  prependHit: (hit) =>
    set((s) => ({ recentHits: [hit, ...s.recentHits].slice(0, 200) })),

  userArticles: [],
  setUserArticles: (articles) => set({ userArticles: articles }),
  prependUserArticle: (article) =>
    set((s) => ({ userArticles: [article, ...s.userArticles] })),
  updateUserArticle: (article) =>
    set((s) => ({
      userArticles: s.userArticles.map((a) => (a.id === article.id ? article : a)),
    })),
  removeUserArticle: (id) =>
    set((s) => ({ userArticles: s.userArticles.filter((a) => a.id !== id) })),

  moverAnalysis: null,
  moverSelectedDate: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()),
  moverHistory: [],
  setMoverAnalysis: (analysis) => set({ moverAnalysis: analysis }),
  setMoverSelectedDate: (date) => set({ moverSelectedDate: date }),
  setMoverHistory: (history) => set({ moverHistory: history }),
}));
