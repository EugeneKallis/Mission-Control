/**
 * Tests for src/components/theme/theme-provider.tsx
 *
 * Covers:
 *  - Provider renders children
 *  - Defaults to midnight-cyan when localStorage is empty
 *  - Reads persisted theme from localStorage
 *  - Falls back to default for invalid stored values
 *  - setThemeId updates context + sets data-theme on <html> + writes localStorage
 *  - Tolerates missing localStorage (SSR/incognito)
 *  - Listens for storage events (cross-tab sync)
 *  - Bootstrapped data-theme attribute takes priority
 *  - Hydration guard: reads html data-theme on mount
 *  - Persistence failure does not block DOM updates
 *  - Removed localStorage value falls back to default
 */

import { describe, test, expect, mock, afterEach, beforeEach } from "bun:test";
import {
  renderWithoutProviders as render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@/test-utils/render";
import { useTheme, ThemeProvider } from "./theme-provider";
import { STORAGE_KEY, DEFAULT_THEME, type ThemeId } from "@/lib/theme";

// ── Helpers ────────────────────────────────────────────────────────────────

function TestConsumer() {
  const { themeId, setThemeId, themes } = useTheme();
  return (
    <div>
      <span data-testid="theme-id">{themeId}</span>
      <span data-testid="theme-count">{themes.length}</span>
      <button
        data-testid="set-graphite"
        onClick={() => setThemeId("graphite-violet" as ThemeId)}
      >
        Set Graphite
      </button>
      <button
        data-testid="set-ember"
        onClick={() => setThemeId("ember-copper" as ThemeId)}
      >
        Set Ember
      </button>
    </div>
  );
}

// ── localStorage mock ──────────────────────────────────────────────────────

// Real mock store (not mock() spies so mockReset doesn't lose implementation)
const mockStore: Record<string, string> = {};

const localStorageMock = {
  getItem: mock((key: string) => mockStore[key] ?? null),
  setItem: mock((key: string, value: string) => {
    mockStore[key] = value;
  }),
  removeItem: mock((key: string) => {
    delete mockStore[key];
  }),
  clear: mock(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
  }),
  get length() {
    return Object.keys(mockStore).length;
  },
  key: (i: number) => Object.keys(mockStore)[i] ?? null,
};

const originalLocalStorage = globalThis.localStorage;

beforeEach(() => {
  // Replace global localStorage with mock for failure tests
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  localStorageMock.clear();
  localStorageMock.getItem.mockReset();
  // After mockReset, re-bind implementation
  localStorageMock.getItem.mockImplementation((key: string) => mockStore[key] ?? null);
  localStorageMock.setItem.mockReset();
  localStorageMock.setItem.mockImplementation((key: string, value: string) => {
    mockStore[key] = value;
  });
  localStorageMock.removeItem.mockReset();
  localStorageMock.removeItem.mockImplementation((key: string) => {
    delete mockStore[key];
  });
  document.documentElement.removeAttribute("data-theme");
  // Restore original localStorage
  Object.defineProperty(globalThis, "localStorage", {
    value: originalLocalStorage,
    writable: true,
    configurable: true,
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("ThemeProvider — useTheme", () => {
  test("renders children", () => {
    render(
      <ThemeProvider>
        <div data-testid="child">hello</div>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});

describe("ThemeProvider — initialisation", () => {
  test("defaults to midnight-cyan when localStorage is empty", () => {
    localStorageMock.clear();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-id").textContent).toBe("midnight-cyan");
  });

  test("reads persisted theme after the hydration-safe first render", async () => {
    localStorageMock.setItem(STORAGE_KEY, "deep-ocean");
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-id").textContent).toBe(DEFAULT_THEME);
    await waitFor(() => {
      expect(screen.getByTestId("theme-id").textContent).toBe("deep-ocean");
    });
  });

  test("falls back to default for invalid stored value", () => {
    localStorageMock.setItem(STORAGE_KEY, "light");
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-id").textContent).toBe(DEFAULT_THEME);
  });

  test("accepts initialThemeId prop", () => {
    render(
      <ThemeProvider initialThemeId="ember-copper">
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-id").textContent).toBe("ember-copper");
  });

  test("initialThemeId overrides localStorage", () => {
    localStorageMock.setItem(STORAGE_KEY, "deep-ocean");
    render(
      <ThemeProvider initialThemeId="graphite-violet">
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-id").textContent).toBe("graphite-violet");
  });

  test("bootstrapped data-theme attribute takes priority over localStorage", async () => {
    // Simulate bootstrap script having set data-theme="ember-copper"
    document.documentElement.setAttribute("data-theme", "ember-copper");
    // But localStorage says midnight-cyan
    localStorageMock.setItem(STORAGE_KEY, "midnight-cyan");
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    // The first client render stays at the server default, then synchronizes.
    expect(screen.getByTestId("theme-id").textContent).toBe(DEFAULT_THEME);
    await waitFor(() => {
      expect(screen.getByTestId("theme-id").textContent).toBe("ember-copper");
    });
  });

  test("handles localStorage throwing during initial read", () => {
    // Make getItem throw
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error("localStorage unavailable");
    });
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    // Should fall back quietly to default
    expect(screen.getByTestId("theme-id").textContent).toBe(DEFAULT_THEME);
  });

  test("handles localStorage throwing with no data-theme attribute", () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error("localStorage unavailable");
    });
    document.documentElement.removeAttribute("data-theme");
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-id").textContent).toBe(DEFAULT_THEME);
  });
});

describe("ThemeProvider — persistence & DOM application", () => {
  test("setThemeId updates context value", () => {
    localStorageMock.clear();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-id").textContent).toBe("midnight-cyan");
    fireEvent.click(screen.getByTestId("set-graphite"));
    expect(screen.getByTestId("theme-id").textContent).toBe("graphite-violet");
  });

  test("setThemeId sets data-theme on <html>", () => {
    localStorageMock.clear();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("midnight-cyan");
    fireEvent.click(screen.getByTestId("set-ember"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("ember-copper");
  });

  test("setThemeId writes to localStorage", () => {
    localStorageMock.clear();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("set-ember"));
    expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY, "ember-copper");
  });

  test("setThemeId updates theme-color meta", () => {
    // Ensure meta tag exists
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      meta.setAttribute("content", "#0f172a");
      document.head.appendChild(meta);
    }
    localStorageMock.clear();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("set-graphite"));
    const m = document.querySelector('meta[name="theme-color"]');
    expect(m?.getAttribute("content")).toBe("#121212");
  });

  test("DOM data-theme is applied even when localStorage.setItem throws", () => {
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error("storage full");
    });
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId("set-ember"));
    // data-theme should still be applied even though persistence failed
    expect(document.documentElement.getAttribute("data-theme")).toBe("ember-copper");
  });
});

describe("ThemeProvider — storage event sync", () => {
  test("updates theme when another tab changes localStorage", () => {
    localStorageMock.clear();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-id").textContent).toBe("midnight-cyan");

    // Simulate a storage event from another tab
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: "deep-ocean",
        }),
      );
    });
    expect(screen.getByTestId("theme-id").textContent).toBe("deep-ocean");
  });

  test("ignores storage events for other keys", () => {
    localStorageMock.clear();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "other-key",
          newValue: "ember-copper",
        }),
      );
    });
    expect(screen.getByTestId("theme-id").textContent).toBe("midnight-cyan");
  });

  test("ignores storage events with invalid values", () => {
    localStorageMock.clear();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: "light",
        }),
      );
    });
    expect(screen.getByTestId("theme-id").textContent).toBe("midnight-cyan");
  });

  test("falls back to default when value is removed from storage", () => {
    localStorageMock.clear();
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    // First set to deep-ocean
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: "deep-ocean",
        }),
      );
    });
    expect(screen.getByTestId("theme-id").textContent).toBe("deep-ocean");
    // Now simulate deletion
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: null,
        }),
      );
    });
    expect(screen.getByTestId("theme-id").textContent).toBe(DEFAULT_THEME);
  });
});

describe("ThemeProvider — hydration guard", () => {
  test("keeps the first client render stable, then reads bootstrapped data-theme", async () => {
    document.documentElement.setAttribute("data-theme", "graphite-violet");
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );

    // Matches the server snapshot during hydration.
    expect(screen.getByTestId("theme-id").textContent).toBe(DEFAULT_THEME);
    await waitFor(() => {
      expect(screen.getByTestId("theme-id").textContent).toBe("graphite-violet");
    });
  });
});
