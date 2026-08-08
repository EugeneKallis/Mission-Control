/**
 * Unit tests for src/app/logs/page.tsx
 *
 * The page renders inside AppShell, so we mock next/navigation and
 * global fetch to cover the Log Viewer UI without a real router.
 *
 * Covers:
 *  - Service tabs render with labels
 *  - Active tab badge is derived from the raw log pane text
 *  - Inactive tab badges are derived from the visible-window API
 *  - Tabs without errors do not show a badge
 *  - "Mark Resolved" clears the aggregate alert, tab badges, and old error lines
 *  - Error log lines are highlighted
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/render";
import { ToastProvider } from "@/components/toast-provider";
import type { ReactNode } from "react";

const mockUsePathname = mock(() => "/logs");
const mockPush = mock(() => {});
mock.module("next/navigation", () => ({
  usePathname: mockUsePathname,
  useRouter: () => ({ push: mockPush, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

// Render the page without the real AppShell/sidebar so alert fetches come only from the page under test.
mock.module("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

const { default: LogsPage } = await import("./page");

const originalFetch = globalThis.fetch;

interface MockResponse {
  status?: number;
  text?: string;
  body?: unknown;
}

function toResponse(r: MockResponse): Response {
  if (r.text !== undefined) {
    return new Response(r.text, { status: r.status ?? 200 });
  }
  return new Response(r.body !== undefined ? JSON.stringify(r.body) : "ok", {
    status: r.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(
  responder: (url: string, init?: RequestInit) => MockResponse | Promise<MockResponse>,
) {
  const mocked = mock(async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : String(input);
    const r = await Promise.resolve(responder(url, init));
    return toResponse(r);
  });
  (globalThis as any).fetch = mocked;
  return mocked;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderPage() {
  return render(
    <ToastProvider>
      <LogsPage />
    </ToastProvider>,
  );
}

const defaultAlertCounts = {
  perService: {
    web: 0,
    "magnet-bridge": 3,
    "broken-link-checker": 0,
    scraper: 1,
    "agent-tasks": 0,
  },
  total: 4,
  acknowledgedAt: null,
};

const visibleCounts = {
  web: 1,
  "magnet-bridge": 2,
  "broken-link-checker": 0,
  scraper: 1,
  "agent-tasks": 0,
};

const defaultResponder = (url: string, init?: RequestInit): MockResponse => {
  if (url.includes("/api/uptime")) return { body: { uptime: "1d 2h" } };
  if (url.includes("/api/logs/alerts/acknowledge")) {
    if (init?.method !== "POST") {
      return { status: 405, text: "Method Not Allowed" };
    }
    return { body: {} };
  }
  if (url.includes("/api/logs/alerts?window=visible")) {
    return { body: { perService: visibleCounts, total: 5, acknowledgedAt: null } };
  }
  if (url.includes("/api/logs/alerts")) {
    return { body: defaultAlertCounts };
  }
  if (url.includes("/api/logs?") && url.includes("since=")) {
    return { text: "info: started\n" };
  }
  if (url.includes("/api/logs?")) return { text: "info: started\nERROR: database error\n" };
  if (url.includes("/api/macros")) return { body: [] };
  if (url.includes("/api/real-debrid/status")) return { body: { ok: true, label: "Premium" } };
  return { body: {} };
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  mockPush.mockReset();
  cleanup();
});

beforeEach(() => {
  sessionStorage.clear();
});

describe("LogsPage", () => {
  test("renders service tabs with labels", async () => {
    mockFetch(defaultResponder);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Web$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Magnet Bridge$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /BL Finder$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Scraper$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Agent Tasks$/i })).toBeInTheDocument();
    });
  });

  test("active tab badge counts errors in the visible log pane", async () => {
    mockFetch(defaultResponder);
    renderPage();
    await waitFor(() => {
      // Web is the active tab; logs contain one ERROR line.
      expect(screen.getByRole("button", { name: /Web 1/i })).toBeInTheDocument();
    });
  });

  test("inactive tab badges use visible-window counts", async () => {
    mockFetch(defaultResponder);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Magnet Bridge 2/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Scraper 1/i })).toBeInTheDocument();
    });

    const web = screen.getByRole("button", { name: /Web 1/i });
    const bl = screen.getByRole("button", { name: /BL Finder$/i });
    const agent = screen.getByRole("button", { name: /Agent Tasks$/i });
    expect(web.textContent).toMatch(/1/);
    expect(bl.textContent).not.toMatch(/\d/);
    expect(agent.textContent).not.toMatch(/\d/);
  });

  test("clicking a tab updates the active badge from the new log pane", async () => {
    mockFetch((url, init) => {
      if (url.includes("/api/logs?service=scraper")) {
        return { text: "scraper ran\nFATAL: scrape crashed\nError: retry failed\n" };
      }
      return defaultResponder(url, init);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Web 1/i })).toBeInTheDocument();
    });

    const scraperTab = screen.getByRole("button", { name: /Scraper/i });
    await act(async () => {
      fireEvent.click(scraperTab);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Scraper 2/i })).toBeInTheDocument();
    });
  });

  test("'Mark Resolved' clears the header alert, tab badges, and old error lines", async () => {
    const ackCalls: { url: string; init?: RequestInit }[] = [];
    mockFetch((url, init) => {
      if (url.includes("/api/logs/alerts/acknowledge")) {
        ackCalls.push({ url, init });
        if (init?.method === "POST") return { body: {} };
        return { status: 405, text: "Method Not Allowed" };
      }
      return defaultResponder(url, init);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Mark Resolved \(4\)/i })).toBeInTheDocument();
    });

    const markBtn = screen.getByRole("button", { name: /Mark Resolved/i });
    await act(async () => {
      fireEvent.click(markBtn);
    });

    expect(ackCalls.length).toBe(1);
    expect(ackCalls[0].init?.method).toBe("POST");

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Mark Resolved/i })).not.toBeInTheDocument();
    });

    // Acknowledgement clears existing errors from both the active pane and
    // the inactive tab counts. New errors will be returned by the next poll.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Web$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Magnet Bridge$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Scraper$/i })).toBeInTheDocument();
      expect(screen.queryByText("ERROR: database error")).not.toBeInTheDocument();
    });
  });

  test("stale alert response after Mark Resolved does not restore the header", async () => {
    const firstAlert = createDeferred<MockResponse>();
    const staleAlert = createDeferred<MockResponse>();
    const ackCalls: { url: string; init?: RequestInit }[] = [];
    let alertCallCount = 0;

    mockFetch((url, init) => {
      if (url.includes("/api/uptime")) return { body: { uptime: "1d 2h" } };
      if (url.includes("/api/logs/alerts/acknowledge")) {
        ackCalls.push({ url, init });
        if (init?.method === "POST") return { body: {} };
        return { status: 405, text: "Method Not Allowed" };
      }
      if (url.includes("/api/logs/alerts?window=visible")) {
        return { body: { perService: visibleCounts, total: 5, acknowledgedAt: null } };
      }
      if (url.includes("/api/logs/alerts")) {
        alertCallCount++;
        if (alertCallCount === 1) return firstAlert.promise;
        if (alertCallCount === 2) return staleAlert.promise;
        return { body: { perService: defaultAlertCounts.perService, total: 0, acknowledgedAt: Date.now() } };
      }
      if (url.includes("/api/logs?") && url.includes("since=")) {
        return { text: "info: started\n" };
      }
      if (url.includes("/api/logs?")) return { text: "info: started\nERROR: database error\n" };
      if (url.includes("/api/macros")) return { body: [] };
      if (url.includes("/api/real-debrid/status")) return { body: { ok: true, label: "Premium" } };
      return { body: {} };
    });

    renderPage();

    // Resolve the initial alert fetch so the header pill appears.
    await act(async () => {
      firstAlert.resolve({ body: defaultAlertCounts });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Mark Resolved \(4\)/i })).toBeInTheDocument();
    });

    // Trigger a second alert fetch and leave it in flight.
    await act(async () => {
      Object.defineProperty(document, "hidden", { value: false, writable: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(alertCallCount).toBe(2);

    // Click Mark Resolved while the second alert fetch is in flight.
    const markBtn = screen.getByRole("button", { name: /Mark Resolved/i });
    await act(async () => {
      fireEvent.click(markBtn);
    });

    expect(ackCalls.length).toBe(1);
    expect(ackCalls[0].init?.method).toBe("POST");

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Mark Resolved/i })).not.toBeInTheDocument();
    });

    // Now resolve the stale alert response with old counts.
    await act(async () => {
      staleAlert.resolve({ body: defaultAlertCounts });
    });

    // Header should stay cleared.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Mark Resolved/i })).not.toBeInTheDocument();
    });

    // Tab badges are cleared after acknowledgement.
    expect(screen.getByRole("button", { name: /Web$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Magnet Bridge$/i })).toBeInTheDocument();
  });

  test("ignores stale log response from previous tab after switching tabs", async () => {
    const webLogs = createDeferred<MockResponse>();
    let logsCallCount = 0;

    mockFetch((url, init) => {
      if (url.includes("/api/logs?")) {
        logsCallCount++;
        if (url.includes("service=web")) return webLogs.promise;
        if (url.includes("service=scraper")) {
          return { text: "scraper ran\nFATAL: scrape crashed\nError: retry failed\n" };
        }
      }
      return defaultResponder(url, init);
    });

    renderPage();
    await waitFor(() => expect(logsCallCount).toBe(1));

    // Switch to scraper before the web log response arrives.
    const scraperTab = screen.getByRole("button", { name: /Scraper/i });
    await act(async () => {
      fireEvent.click(scraperTab);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Scraper 2/i })).toBeInTheDocument();
    });

    // Resolve the stale web response.
    await act(async () => {
      webLogs.resolve({ text: "web old\nERROR: stale web error\n" });
    });

    // Scraper badge should remain; stale web logs must not replace scraper logs.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Scraper 2/i })).toBeInTheDocument();
    });
  });

  test("ignores stale visible-count response after a newer fetch resolves", async () => {
    const firstVisible = createDeferred<MockResponse>();
    const secondVisible = createDeferred<MockResponse>();
    const zeroCounts = {
      web: 0,
      "magnet-bridge": 0,
      "broken-link-checker": 0,
      scraper: 0,
      "agent-tasks": 0,
    };
    let visibleCallCount = 0;

    mockFetch((url, init) => {
      if (url.includes("/api/logs/alerts?window=visible")) {
        visibleCallCount++;
        if (visibleCallCount === 1) return firstVisible.promise;
        if (visibleCallCount === 2) return secondVisible.promise;
        return { body: { perService: visibleCounts, total: 5, acknowledgedAt: null } };
      }
      return defaultResponder(url, init);
    });

    renderPage();
    await waitFor(() => expect(visibleCallCount).toBe(1));

    // Trigger a second visible-count fetch.
    await act(async () => {
      Object.defineProperty(document, "hidden", { value: false, writable: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(visibleCallCount).toBe(2);

    // Resolve the newer fetch with zero counts first.
    await act(async () => {
      secondVisible.resolve({ body: { perService: zeroCounts, total: 0, acknowledgedAt: null } });
    });
    await waitFor(() => {
      const mb = screen.getByRole("button", { name: /Magnet Bridge$/i });
      expect(mb.textContent).not.toMatch(/\d/);
    });

    // Resolve the stale older fetch with counts.
    await act(async () => {
      firstVisible.resolve({ body: { perService: visibleCounts, total: 5, acknowledgedAt: null } });
    });

    // Badges should stay cleared.
    await waitFor(() => {
      const mb = screen.getByRole("button", { name: /Magnet Bridge$/i });
      expect(mb.textContent).not.toMatch(/\d/);
      const scraper = screen.getByRole("button", { name: /Scraper$/i });
      expect(scraper.textContent).not.toMatch(/\d/);
    });
  });
});
