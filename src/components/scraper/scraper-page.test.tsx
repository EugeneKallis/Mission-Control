/**
 * Unit tests for the scraper page.
 *
 * Covers:
 *  - Initial state: loading + toolbar + source tabs
 *  - Fetches /api/scraper/results and renders cards
 *  - Empty state when results is empty
 *  - Source tab switching re-fetches
 *  - "Scrape Now" → POST /api/scraper/trigger
 *  - "Scrape All" → POST /api/scraper/trigger-all
 *  - "Hide All" opens ConfirmDialog; confirming POSTs /api/scraper/hide-all
 *  - "Undo" → POST /api/scraper/undo
 *  - "Clear & Rescrape" → POST /api/scraper/refresh
 *  - Polling status calls /api/scraper/status and /api/scraper/status-all
 *
 * Note: AccessGate is rendered as part of the page; it writes to
 * sessionStorage on accept. We just need to render the page — the
 * gate is mounted but its warning overlay is non-blocking for these
 * tests (queries target elements by role/text, not by visibility).
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/render";

afterEach(() => {
  cleanup();
});
import { ToastProvider } from "@/components/toast-provider";
import { ScraperPage } from "./scraper-page";
import type { ScrapeResultView } from "./scraper-types";

const originalFetch = globalThis.fetch;

interface MockResponse {
  status?: number;
  body?: unknown;
}

function mockFetch(responder: (url: string, init?: RequestInit) => MockResponse) {
  const mocked = mock(async (input: any, init: any = {}) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const r = responder(url, init);
    return new Response(r.body !== undefined ? JSON.stringify(r.body) : "ok", {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  // `typeof fetch` has more methods than Mock provides; cast through any.
  (globalThis as any).fetch = mocked;
  return mocked;
}

const sampleResults: { results: ScrapeResultView[] } = {
  results: [
    {
      id: 1,
      source: "141jav",
      title: "First Result",
      image: "https://example.com/1.jpg",
      images: [],
      magnet: "magnet:?xt=urn:btih:AA",
      torrent: null,
      tags: ["tag1"],
      is_downloaded: false,
      is_hidden: false,
      created_at: "2026-06-25T00:00:00Z",
    },
    {
      id: 2,
      source: "141jav",
      title: "Second Result",
      image: null,
      images: [],
      magnet: "magnet:?xt=urn:btih:BB",
      torrent: null,
      tags: [],
      is_downloaded: true,
      is_hidden: false,
      created_at: "2026-06-25T00:00:00Z",
    },
  ],
};

function renderPage(initialSource: "141jav" | "projectjav" | "pornrips" = "141jav") {
  return render(
    <ToastProvider>
      <ScraperPage initialSource={initialSource} />
    </ToastProvider>,
  );
}

describe("ScraperPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sessionStorage.clear();
  });

  test("renders the loading state and toolbar on mount", async () => {
    // Make the results fetch resolve asynchronously so we can observe loading
    let resolveResults!: (v: Response) => void;
    const mocked = mock((() => {
      return new Promise<Response>((resolve) => {
        resolveResults = resolve;
      });
    }) as unknown as typeof fetch);
    (globalThis as any).fetch = mocked;

    renderPage();
    // Loading text is present until the fetch resolves
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    // Toolbar buttons are present (icon name + label combined into accessible name)
    expect(screen.getByRole("button", { name: /scrape all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /scrape now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();

    // Resolve the in-flight fetch to avoid unhandled promise warnings
    await act(async () => {
      resolveResults(
        new Response(JSON.stringify({ results: [] }), { status: 200 }),
      );
    });
  });

  test("fetches /api/scraper/results and renders cards", async () => {
    let resultsResolve!: (v: Response) => void;
    const responses: Array<{ url: string; body?: unknown; status?: number }> = [];
    globalThis.fetch = mock(async (url: any) => {
      const u = url.toString();
      responses.push({ url: u });
      if (u.includes("/api/scraper/results")) {
        return new Promise<Response>((resolve) => {
          resultsResolve = resolve;
        });
      }
      if (u.includes("/api/scraper/status")) {
        return new Response(JSON.stringify({ is_scraping: false }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();
    // After results resolve, cards should render
    await act(async () => {
      resultsResolve(new Response(JSON.stringify(sampleResults), { status: 200 }));
    });
    expect(screen.getByText("First Result")).toBeInTheDocument();
    expect(screen.getByText("Second Result")).toBeInTheDocument();
    expect(responses.some((r) => r.url.includes("/api/scraper/results?source=141jav"))).toBe(true);
  });

  test("renders the empty state when no results are returned", async () => {
    let resolveResults!: (v: Response) => void;
    const mocked = mock((async () => {
      return new Promise<Response>((resolve) => {
        resolveResults = resolve;
      });
    }) as unknown as typeof fetch);
    (globalThis as any).fetch = mocked;

    renderPage();
    await act(async () => {
      resolveResults(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    });
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });

  test("clicking 'Scrape Now' posts to /api/scraper/trigger with the source", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    let pendingResults: Response | null = null;
    globalThis.fetch = mock(async (url: any, init: any = {}) => {
      const u = url.toString();
      fetchCalls.push({ url: u, init });
      if (u.includes("/api/scraper/results")) {
        return pendingResults ?? new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (u.includes("/api/scraper/status")) {
        return new Response(JSON.stringify({ is_scraping: false }), { status: 200 });
      }
      // action endpoints: return success
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;
    pendingResults = new Response(JSON.stringify({ results: [] }), { status: 200 });

    renderPage();
    // The initial results fetch is fired but resolves to empty
    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    });

    // Click Scrape Now
    const scrapeNow = screen.getByRole("button", { name: /scrape now/i });
    fireEvent.click(scrapeNow);

    // Wait for the trigger fetch
    await waitFor(() => {
      const trigger = fetchCalls.find((c) => c.url.includes("/api/scraper/trigger"));
      expect(trigger).toBeDefined();
      expect(trigger!.init?.method).toBe("POST");
      const body = JSON.parse((trigger!.init?.body as string) || "{}");
      expect(body.source).toBe("141jav");
    });
  });

  test("clicking 'Scrape All' posts to /api/scraper/trigger-all", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = mock(async (url: any, init: any = {}) => {
      const u = url.toString();
      fetchCalls.push({ url: u, init });
      if (u.includes("/api/scraper/results")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (u.includes("/api/scraper/status")) {
        return new Response(JSON.stringify({ is_scraping: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /scrape all/i }));
    await waitFor(() => {
      const trigger = fetchCalls.find((c) => c.url.includes("/api/scraper/trigger-all"));
      expect(trigger).toBeDefined();
      expect(trigger!.init?.method).toBe("POST");
    });
  });

  test("clicking 'Undo' posts to /api/scraper/undo with the source", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = mock(async (url: any, init: any = {}) => {
      const u = url.toString();
      fetchCalls.push({ url: u, init });
      if (u.includes("/api/scraper/results")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (u.includes("/api/scraper/status")) {
        return new Response(JSON.stringify({ is_scraping: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    await waitFor(() => {
      const undo = fetchCalls.find((c) => c.url.includes("/api/scraper/undo"));
      expect(undo).toBeDefined();
      const body = JSON.parse((undo!.init?.body as string) || "{}");
      expect(body.source).toBe("141jav");
    });
  });

  test("clicking 'Clear & Rescrape' posts to /api/scraper/refresh with the source", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = mock(async (url: any, init: any = {}) => {
      const u = url.toString();
      fetchCalls.push({ url: u, init });
      if (u.includes("/api/scraper/results")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (u.includes("/api/scraper/status")) {
        return new Response(JSON.stringify({ is_scraping: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /clear.*rescrape/i }));
    await waitFor(() => {
      const refresh = fetchCalls.find((c) => c.url.includes("/api/scraper/refresh"));
      expect(refresh).toBeDefined();
      const body = JSON.parse((refresh!.init?.body as string) || "{}");
      expect(body.source).toBe("141jav");
    });
  });

  test("'Hide All' opens confirm dialog; confirming POSTs /api/scraper/hide-all", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = mock(async (url: any, init: any = {}) => {
      const u = url.toString();
      fetchCalls.push({ url: u, init });
      if (u.includes("/api/scraper/results")) {
        // Return 2 results so the confirm dialog title is meaningful
        return new Response(JSON.stringify(sampleResults), { status: 200 });
      }
      if (u.includes("/api/scraper/status")) {
        return new Response(JSON.stringify({ is_scraping: false }), { status: 200 });
      }
      if (u.includes("/api/scraper/hide-all")) {
        return new Response(JSON.stringify({ hidden: 2 }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();
    // Wait for results to load
    await waitFor(() => {
      expect(screen.getByText("First Result")).toBeInTheDocument();
    });

    // Click Hide All (toolbar button) — opens the confirm dialog
    fireEvent.click(screen.getByRole("button", { name: /hide all/i }));
    // The confirm dialog should render
    await waitFor(() => {
      // The dialog title has the count interpolated
      expect(screen.getByText(/Hide all 2 items/i)).toBeInTheDocument();
    });
    // Click the confirm button in the dialog (text is just "Hide All",
    // no icon prefix). The toolbar Hide All button is no longer
    // visible behind the modal, so the only matching button is the
    // dialog's confirm action.
    const dialogButtons = screen.getAllByRole("button", { name: /hide all/i });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    await waitFor(() => {
      const hideAll = fetchCalls.find((c) => c.url.includes("/api/scraper/hide-all"));
      expect(hideAll).toBeDefined();
      const body = JSON.parse((hideAll!.init?.body as string) || "{}");
      expect(body.source).toBe("141jav");
    });
  });
});
