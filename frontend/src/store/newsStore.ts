import { create } from "zustand";
import { NewsArticle } from "../types";

const MAX_ARTICLES = 200;

interface NewsState {
  articles: NewsArticle[];
  filterTicker: string | null;
  modalArticle: NewsArticle | null;
  modalType: "ai" | "article" | null;
  addArticle: (a: NewsArticle) => void;
  setFilterTicker: (t: string | null) => void;
  filteredArticles: () => NewsArticle[];
  updateArticleAi: (receivedAt: string, ticker: string, aiStars: number, aiAnalysis: string, aiConfidence: string) => void;
  openModal: (article: NewsArticle, type: "ai" | "article") => void;
  closeModal: () => void;
}

export const useNewsStore = create<NewsState>((set, get) => ({
  articles: [],
  filterTicker: null,
  modalArticle: null,
  modalType: null,

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

  updateArticleAi: (receivedAt, ticker, aiStars, aiAnalysis, aiConfidence) =>
    set((s) => ({
      articles: s.articles.map((a) =>
        a.receivedAt === receivedAt && a.ticker === ticker
          ? { ...a, aiStars, aiAnalysis, aiConfidence }
          : a
      ),
      // Also update modal article if it matches
      modalArticle:
        s.modalArticle && s.modalArticle.receivedAt === receivedAt && s.modalArticle.ticker === ticker
          ? { ...s.modalArticle, aiStars, aiAnalysis, aiConfidence }
          : s.modalArticle,
    })),

  openModal: (article, type) => set({ modalArticle: article, modalType: type }),
  closeModal: () => set({ modalArticle: null, modalType: null }),
}));
