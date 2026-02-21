import { create } from "zustand";
import { NewsArticle } from "../types";

const MAX_ARTICLES = 200;

interface NewsState {
  articles: NewsArticle[];
  filterTicker: string | null;
  addArticle: (a: NewsArticle) => void;
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

  setFilterTicker: (filterTicker) => set({ filterTicker }),

  filteredArticles: () => {
    const { articles, filterTicker } = get();
    if (!filterTicker) return articles;
    return articles.filter((a) => a.ticker === filterTicker);
  },
}));
