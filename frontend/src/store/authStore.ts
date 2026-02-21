import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  needsSetup: boolean;
  setToken: (token: string) => void;
  setNeedsSetup: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      needsSetup: false,
      setToken: (token) => set({ token }),
      setNeedsSetup: (needsSetup) => set({ needsSetup }),
      logout: () => set({ token: null }),
    }),
    { name: "dtdash-auth", partialize: (s) => ({ token: s.token }) }
  )
);
