import { create } from "zustand";
import { NewsArticle } from "../types";

const MAX_ARTICLES = 200;

interface NewsState {
  articles: NewsArticle[];
  filterTicker: string | null;
  addArticle: (a: NewsArticle) => void;
  backfill: (articles: NewsArticle[]) => void;
  setFilterTicker: (t: string | null) => void;
  filteredArticles: () => NewsArticle[];
}

export const useNewsStore = create<NewsState>((set, get) => ({
  articles: [],
  filterTicker: null,

  addArticle: (article) =>
    set((s) => ({
      articles: [article, ...s.articles].slice(0, MAX_ARTICLES),
    })),

  backfill: (incoming) =>
    set((s) => {
      // Merge without duplicates (match on ticker + receivedAt)
      const existing = new Set(s.articles.map((a) => `${a.ticker}:${a.receivedAt}`));
      const novel = incoming.filter((a) => !existing.has(`${a.ticker}:${a.receivedAt}`));
      return { articles: [...s.articles, ...novel].slice(0, MAX_ARTICLES) };
    }),

  setFilterTicker: (filterTicker) => set({ filterTicker }),

  filteredArticles: () => {
    const { articles, filterTicker } = get();
    if (!filterTicker) return articles;
    return articles.filter((a) => a.ticker === filterTicker);
  },
}));
