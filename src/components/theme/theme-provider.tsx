"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  STORAGE_KEY,
  THEMES,
  DEFAULT_THEME,
  type ThemeId,
  isValidThemeId,
  getThemeColor,
} from "@/lib/theme";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Safe localStorage getItem — returns null on failure (SSR, incognito, etc.). */
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Safe localStorage setItem — best-effort, failures are silently ignored. */
function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable — DOM application is not blocked
  }
}

/** Read the currently applied data-theme from <html> (set by bootstrap script). */
function readBootstrappedTheme(): ThemeId | null {
  if (typeof document === "undefined") return null;
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr && isValidThemeId(attr)) return attr;
  return null;
}

/** Apply a theme independently of persistence so storage failures never block the UI. */
function applyTheme(id: ThemeId, persist: boolean): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", id);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", getThemeColor(id));
  }
  if (persist && typeof window !== "undefined") {
    safeSet(STORAGE_KEY, id);
  }
}

// ── Context Shape ──────────────────────────────────────────────────────────

interface ThemeContextValue {
  /** Current theme id. Never an invalid value — defaults to midnight-cyan. */
  themeId: ThemeId;
  /** Set and persist a theme id. */
  setThemeId: (id: ThemeId) => void;
  /** The full list of available themes (for the UI). */
  themes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

interface ThemeProviderProps {
  children: ReactNode;
  /** Optional deterministic initial value, primarily for isolated tests. */
  initialThemeId?: ThemeId;
}

export function ThemeProvider({ children, initialThemeId }: ThemeProviderProps) {
  // The server and first client render intentionally share this value. The
  // bootstrap script already paints the persisted palette; React synchronizes
  // its context after hydration so switcher text cannot cause a mismatch.
  const initialTheme = initialThemeId && isValidThemeId(initialThemeId)
    ? initialThemeId
    : DEFAULT_THEME;
  const [themeId, setThemeIdState] = useState<ThemeId>(initialTheme);

  useEffect(() => {
    const bootstrapped = readBootstrappedTheme();
    const stored = typeof window !== "undefined" ? safeGet(STORAGE_KEY) : null;
    const resolved = initialThemeId && isValidThemeId(initialThemeId)
      ? initialThemeId
      : bootstrapped ?? (stored && isValidThemeId(stored) ? stored : DEFAULT_THEME);

    applyTheme(resolved, false);
    if (resolved === initialTheme) return;

    // Defer the context update until after hydration. The palette is already
    // correct because the head bootstrap applied it before first paint.
    const frame = requestAnimationFrame(() => setThemeIdState(resolved));
    return () => cancelAnimationFrame(frame);
  }, [initialTheme, initialThemeId]);

  // Listen for storage events (cross-tab sync).
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const resolved = e.newValue && isValidThemeId(e.newValue)
        ? e.newValue
        : DEFAULT_THEME;
      applyTheme(resolved, false);
      setThemeIdState(resolved);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setThemeId = useCallback((id: ThemeId) => {
    applyTheme(id, true);
    setThemeIdState(id);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeId, setThemeId, themes: THEMES }),
    [themeId, setThemeId],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a <ThemeProvider>");
  }
  return ctx;
}
