import { create } from "zustand";

export type Page = "dashboard" | "trades" | "newsfeeds" | "recap" | "history" | "bot";

const STORAGE_KEY = "dtdash_page";

function loadPage(): Page {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && ["dashboard", "trades", "newsfeeds", "recap", "history", "bot"].includes(stored)) {
      return stored as Page;
    }
  } catch { /* SSR / no sessionStorage */ }
  return "dashboard";
}

interface PageState {
  page: Page;
  setPage: (page: Page) => void;
}

export const usePageStore = create<PageState>((set) => ({
  page: loadPage(),
  setPage: (page) => {
    try { sessionStorage.setItem(STORAGE_KEY, page); } catch {}
    set({ page });
  },
}));
