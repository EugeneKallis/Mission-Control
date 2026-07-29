/**
 * Tests for src/lib/theme.ts — theme registry, type guard, bootstrap script.
 *
 * Covers:
 *  - THEMES includes exactly 4 entries with required fields
 *  - DEFAULT_THEME is "midnight-cyan"
 *  - STORAGE_KEY is versioned
 *  - isValidThemeId rejects unknown/corrupt values
 *  - getTheme / getThemeColor return correct values
 *  - BOOTSTRAP_SCRIPT is valid JS with correct fallback behaviour
 *  - Bootstrap sets theme even when localStorage throws
 */

import { describe, test, expect } from "bun:test";
import {
  THEMES,
  DEFAULT_THEME,
  STORAGE_KEY,
  isValidThemeId,
  getTheme,
  getThemeColor,
  BOOTSTRAP_SCRIPT,
  type ThemeId,
} from "./theme";

describe("THEMES registry", () => {
  test("contains exactly 4 themes", () => {
    expect(THEMES.length).toBe(4);
  });

  test("each theme has required fields", () => {
    for (const theme of THEMES) {
      expect(theme.id).toBeTruthy();
      expect(theme.label).toBeTruthy();
      expect(theme.description).toBeTruthy();
      expect(theme.swatches.length).toBeGreaterThanOrEqual(2);
      expect(theme.themeColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test("all theme ids are unique", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("DEFAULT_THEME is in THEMES", () => {
    expect(THEMES.some((t) => t.id === DEFAULT_THEME)).toBe(true);
  });

  test("DEFAULT_THEME is midnight-cyan", () => {
    expect(DEFAULT_THEME).toBe("midnight-cyan");
  });

  test("STORAGE_KEY is versioned", () => {
    expect(STORAGE_KEY).toBe("mission-control:theme:v1");
  });
});

describe("isValidThemeId", () => {
  test("returns true for valid theme ids", () => {
    for (const theme of THEMES) {
      expect(isValidThemeId(theme.id)).toBe(true);
    }
  });

  test("returns false for unknown strings", () => {
    expect(isValidThemeId("light")).toBe(false);
    expect(isValidThemeId("midnight")).toBe(false);
    expect(isValidThemeId("")).toBe(false);
    expect(isValidThemeId("midnight-cyan ")).toBe(false);
  });

  test("is a type guard", () => {
    const input: string = "midnight-cyan";
    if (isValidThemeId(input)) {
      const _narrows: ThemeId = input;
      expect(_narrows).toBe("midnight-cyan");
    }
  });
});

describe("getTheme", () => {
  test("returns the entry for a valid id", () => {
    const theme = getTheme("deep-ocean");
    expect(theme).toBeDefined();
    expect(theme!.label).toBe("Deep Ocean");
  });

  test("returns undefined for unknown id", () => {
    expect(getTheme("light")).toBeUndefined();
  });
});

describe("getThemeColor", () => {
  test("returns the themeColor for a valid id", () => {
    expect(getThemeColor("ember-copper")).toBe("#1c1410");
  });

  test("returns the default theme color for unknown id", () => {
    expect(getThemeColor("unknown")).toBe("#0f172a");
  });
});

function executeBootstrap(getItem: () => string | null) {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const existingMeta = document.querySelector('meta[name="theme-color"]');
  const meta = existingMeta ?? document.head.appendChild(document.createElement("meta"));
  meta.setAttribute("name", "theme-color");
  const previousMeta = meta.getAttribute("content");

  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem },
    configurable: true,
  });
  document.documentElement.removeAttribute("data-theme");

  try {
    new Function(BOOTSTRAP_SCRIPT)();
    return {
      theme: document.documentElement.getAttribute("data-theme"),
      themeColor: meta.getAttribute("content"),
    };
  } finally {
    document.documentElement.removeAttribute("data-theme");
    if (storageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
    if (existingMeta) {
      if (previousMeta === null) meta.removeAttribute("content");
      else meta.setAttribute("content", previousMeta);
    } else {
      meta.remove();
    }
  }
}

describe("BOOTSTRAP_SCRIPT", () => {
  test("is a non-empty string", () => {
    expect(BOOTSTRAP_SCRIPT.length).toBeGreaterThan(10);
  });

  test("contains the versioned storage key reference", () => {
    expect(BOOTSTRAP_SCRIPT).toContain(STORAGE_KEY);
  });

  test("contains all theme ids", () => {
    for (const theme of THEMES) {
      expect(BOOTSTRAP_SCRIPT).toContain(theme.id);
    }
  });

  test("contains the default theme as fallback", () => {
    expect(BOOTSTRAP_SCRIPT).toContain(DEFAULT_THEME);
  });

  test("is parseable JavaScript (no syntax error)", () => {
    let threw = false;
    try {
      new Function(BOOTSTRAP_SCRIPT);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  test("sets data-theme and theme-color when localStorage has a valid value", () => {
    expect(BOOTSTRAP_SCRIPT).toContain("localStorage.getItem");
    expect(BOOTSTRAP_SCRIPT).toContain("setAttribute");
    expect(BOOTSTRAP_SCRIPT).toContain("data-theme");
    expect(BOOTSTRAP_SCRIPT).toContain('meta[name="theme-color"]');
  });

  test("localStorage read is inside try/catch, DOM application is outside", () => {
    // The script should have the try block only around the getItem call
    const tryBlock = "try { t = localStorage.getItem";
    const domApp = 'document.documentElement.setAttribute("data-theme", t);';
    // The try block should contain getItem
    expect(BOOTSTRAP_SCRIPT).toContain(tryBlock);
    // The setAttribute should be AFTER the try block closes
    const tryEndIndex = BOOTSTRAP_SCRIPT.indexOf("} catch(e){}");
    const setAttrIndex = BOOTSTRAP_SCRIPT.indexOf(domApp);
    expect(setAttrIndex).toBeGreaterThan(tryEndIndex);
  });

  test("executes a valid persisted theme", () => {
    expect(executeBootstrap(() => "deep-ocean")).toEqual({
      theme: "deep-ocean",
      themeColor: "#0a1628",
    });
  });

  test("falls back when storage is missing or invalid", () => {
    expect(executeBootstrap(() => null).theme).toBe(DEFAULT_THEME);
    expect(executeBootstrap(() => "not-a-theme").theme).toBe(DEFAULT_THEME);
  });

  test("falls back to default when localStorage throws", () => {
    const result = executeBootstrap(() => {
      throw new Error("storage blocked");
    });
    expect(result).toEqual({
      theme: DEFAULT_THEME,
      themeColor: "#0f172a",
    });
  });
});
