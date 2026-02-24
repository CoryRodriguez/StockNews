import { create } from "zustand";

export type Page = "dashboard" | "trades";

interface PageState {
  page: Page;
  setPage: (page: Page) => void;
}

export const usePageStore = create<PageState>((set) => ({
  page: "dashboard",
  setPage: (page) => set({ page }),
}));
