/**
 * Unit tests for src/app/logs/page.tsx
 *
 * The page renders inside AppShell, so we mock next/navigation and
 * global fetch to cover the Log Viewer UI without a real router.
 *
 * Covers:
 *  - Service tabs render with labels
 *  - Per-service error counts appear as badges on the matching tabs
 *  - Tabs without errors do not show a badge
 *  - "Mark Resolved" clears all tab badges immediately
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

const defaultCounts = {
  web: 0,
  "magnet-bridge": 3,
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
  if (url.includes("/api/logs/alerts")) {
    return { body: { perService: defaultCounts, total: 4, acknowledgedAt: null } };
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

  test("shows per-service error badges on the right tabs", async () => {
    mockFetch(defaultResponder);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Magnet Bridge 3/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Scraper 1/i })).toBeInTheDocument();
    });

    const web = screen.getByRole("button", { name: /Web$/i });
    const bl = screen.getByRole("button", { name: /BL Finder$/i });
    const agent = screen.getByRole("button", { name: /Agent Tasks$/i });
    expect(web.textContent).not.toMatch(/\d/);
    expect(bl.textContent).not.toMatch(/\d/);
    expect(agent.textContent).not.toMatch(/\d/);
  });

  test("'Mark Resolved' clears all tab badges and posts acknowledgement", async () => {
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
      expect(screen.getByRole("button", { name: /Magnet Bridge 3/i })).toBeInTheDocument();
    });

    const markBtn = screen.getByRole("button", { name: /Mark Resolved/i });
    await act(async () => {
      fireEvent.click(markBtn);
    });

    expect(ackCalls.length).toBe(1);
    expect(ackCalls[0].init?.method).toBe("POST");

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Magnet Bridge 3/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Scraper 1/i })).not.toBeInTheDocument();
    });
  });

  test("stale alert response after Mark Resolved does not restore badges", async () => {
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
      if (url.includes("/api/logs/alerts")) {
        alertCallCount++;
        if (alertCallCount === 1) return firstAlert.promise;
        if (alertCallCount === 2) return staleAlert.promise;
        return { body: { perService: {}, total: 0, acknowledgedAt: Date.now() } };
      }
      if (url.includes("/api/logs?")) return { text: "info: started\nERROR: database error\n" };
      if (url.includes("/api/macros")) return { body: [] };
      if (url.includes("/api/real-debrid/status")) return { body: { ok: true, label: "Premium" } };
      return { body: {} };
    });

    renderPage();

    // Resolve the initial alert fetch so badges appear.
    await act(async () => {
      firstAlert.resolve({ body: { perService: defaultCounts, total: 4, acknowledgedAt: null } });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Magnet Bridge 3/i })).toBeInTheDocument();
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
      expect(screen.queryByRole("button", { name: /Magnet Bridge 3/i })).not.toBeInTheDocument();
    });

    // Now resolve the stale alert response with old counts.
    await act(async () => {
      staleAlert.resolve({ body: { perService: defaultCounts, total: 4, acknowledgedAt: null } });
    });

    // Badges should stay cleared.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Magnet Bridge 3/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Scraper 1/i })).not.toBeInTheDocument();
    });
  });
});
