import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const THEME_KEY = "vendor_theme_dark";

interface ThemeState {
  dark: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggleDark: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  dark: false,
  hydrated: false,
  hydrate: async () => {
    const v = await SecureStore.getItemAsync(THEME_KEY);
    set({ dark: v === "1", hydrated: true });
  },
  toggleDark: () => {
    const next = !get().dark;
    set({ dark: next });
    SecureStore.setItemAsync(THEME_KEY, next ? "1" : "0").catch(() => {});
  },
}));

/** Shared light/dark color tokens — used by the app shell and Settings screen. */
export function useThemeColors() {
  const dark = useThemeStore(s => s.dark);
  return dark
    ? { bg: "#0f172a", card: "#1e293b", border: "#334155", text: "#f1f5f9", subtext: "#94a3b8", tabBar: "#1e293b" }
    : { bg: "#f9fafb", card: "#ffffff", border: "#f3f4f6", text: "#111827", subtext: "#9ca3af", tabBar: "#ffffff" };
}
