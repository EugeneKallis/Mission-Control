/**
 * Theme Registry — Mission Control runtime theme system.
 *
 * This module is pure data/logic and safe to import from server root layout.
 * It defines the four dark themes, their metadata, the bootstrap FOUC script,
 * and type-safe helpers.
 */

/** Supported theme identifiers — always keep this list in sync with THEMES. */
export type ThemeId =
  | "midnight-cyan"
  | "graphite-violet"
  | "deep-ocean"
  | "ember-copper";

export interface ThemeEntry {
  id: ThemeId;
  label: string;
  description: string;
  /** 2-3 representative palette swatches for the picker UI. */
  swatches: [string, string, string];
  /** Value for <meta name="theme-color">. */
  themeColor: string;
}

export const THEMES: ThemeEntry[] = [
  {
    id: "midnight-cyan",
    label: "Midnight Cyan",
    description: "Navy/slate base with cyan primary",
    swatches: ["#0F172A", "#22D3EE", "#1E293B"],
    themeColor: "#0f172a",
  },
  {
    id: "graphite-violet",
    label: "Graphite Violet",
    description: "Near-neutral graphite with violet primary",
    swatches: ["#121212", "#A78BFA", "#1E1E2E"],
    themeColor: "#121212",
  },
  {
    id: "deep-ocean",
    label: "Deep Ocean",
    description: "Deep blue/teal with sky primary",
    swatches: ["#0A1628", "#38BDF8", "#102A40"],
    themeColor: "#0a1628",
  },
  {
    id: "ember-copper",
    label: "Ember Copper",
    description: "Warm espresso with copper primary",
    swatches: ["#1C1410", "#FB923C", "#2A1F18"],
    themeColor: "#1c1410",
  },
] as const;

export const DEFAULT_THEME: ThemeId = "midnight-cyan";
export const STORAGE_KEY = "mission-control:theme:v1";

/** Type guard — safely narrows an unknown string to ThemeId. */
export function isValidThemeId(id: string): id is ThemeId {
  return THEMES.some((t) => t.id === id);
}

/** Look up a ThemeEntry by id. Returns undefined for unknown ids. */
export function getTheme(id: string): ThemeEntry | undefined {
  return THEMES.find((t) => t.id === id);
}

/** Convenience: get the theme-color value for an id (or the default). */
export function getThemeColor(id: string): string {
  return getTheme(id)?.themeColor ?? getTheme(DEFAULT_THEME)!.themeColor;
}

/** Synchronous inline <script> to prevent first-paint flash.
 *
 * Place before any stylesheet in <head>. It reads the persisted theme
 * from localStorage (best-effort), validates it against the allowlist,
 * and sets both data-theme on <html> and the theme-color meta.
 * Unknown/corrupt or unreadable values fall back to Midnight Cyan.
 *
 * The DOM/meta mutations happen OUTSIDE the localStorage try/catch
 * so that a throwing storage environment still gets the correct theme.
 */
export const BOOTSTRAP_SCRIPT = `(function(){
  var t;
  try { t = localStorage.getItem("${STORAGE_KEY}"); } catch(e){}
  var valid = ${JSON.stringify(THEMES.map((t) => t.id))};
  if (!t || valid.indexOf(t) === -1) t = "${DEFAULT_THEME}";
  document.documentElement.setAttribute("data-theme", t);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) {
    var colors = ${JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, t.themeColor])))};
    m.content = colors[t] || colors["${DEFAULT_THEME}"];
  }
})();`;
