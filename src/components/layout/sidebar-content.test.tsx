/**
 * Unit tests for src/components/layout/sidebar-content.tsx
 *
 * The component:
 *  - fetches /api/real-debrid/status on mount
 *  - fetches /api/macros on mount
 *  - renders a static set of NavItems
 *  - dispatches "macro:run" events on macro click
 *
 * Strategy: mock next/navigation and globalThis.fetch; the render output
 * is fully deterministic.
 */
import { describe, test, expect, mock, afterEach, beforeEach } from "bun:test";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@/test-utils/render";

const mockUsePathname = mock(() => "/");
const mockPush = mock(() => {});
mock.module("next/navigation", () => ({
  usePathname: mockUsePathname,
  useRouter: () => ({ push: mockPush, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const { SidebarContent } = await import("./sidebar-content");

const originalFetch = globalThis.fetch;
function mockFetch(responder: (url: string) => unknown) {
  globalThis.fetch = mock(async (url: string) => {
    const body = responder(url);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  mockPush.mockReset();
  cleanup();
});

beforeEach(() => {
  Object.defineProperty(document, "hidden", {
    value: false,
    writable: true,
    configurable: true,
  });
});

describe("SidebarContent — brand & version", () => {
  test("renders the default brand and version", () => {
    mockFetch(() => ({}));
    render(<SidebarContent />);
    expect(screen.getByText("Mission Control")).toBeInTheDocument();
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
  });

  test("renders custom brand and version when provided", () => {
    mockFetch(() => ({}));
    render(<SidebarContent brand="Acme" version="9.9.9" />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("v9.9.9")).toBeInTheDocument();
  });

  test("renders uptime when provided", () => {
    mockFetch(() => ({}));
    render(<SidebarContent uptime="5d 12h" />);
    expect(screen.getByText("5d 12h")).toBeInTheDocument();
  });
});

describe("SidebarContent — RD status fetch", () => {
  test("shows 'Loading…' before status resolves", () => {
    mockFetch(() => new Promise(() => {})); // never resolves
    render(<SidebarContent />);
    // Both RD Loading… and macros Loading… are in the tree.
    const loadingNodes = screen.getAllByText(/Loading/i);
    expect(loadingNodes.length).toBeGreaterThan(0);
  });

  test("renders RD status label from the API on success", async () => {
    mockFetch((url) => {
      if (url.includes("/api/real-debrid/status")) return { label: "Premium", ok: true };
      return [];
    });
    render(<SidebarContent />);
    await waitFor(() => {
      expect(screen.getByText("Premium")).toBeInTheDocument();
    });
  });

  test("falls back to 'Offline' when the status fetch rejects", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    render(<SidebarContent />);
    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });
  });
});

describe("SidebarContent — macros list", () => {
  test("renders 'No macros configured.' when the macros list is empty", async () => {
    mockFetch((url) => {
      if (url.includes("/api/real-debrid/status")) return { label: "Premium", ok: true };
      return [];
    });
    render(<SidebarContent />);
    await waitFor(() => {
      expect(screen.getByText(/No macros configured/i)).toBeInTheDocument();
    });
  });

  test("renders grouped macros from the API", async () => {
    mockFetch((url) => {
      if (url.includes("/api/real-debrid/status")) return { label: "Premium", ok: true };
      if (url.includes("/api/macros")) {
        return [
          {
            group: { id: 1, name: "Daily", ord: 0 },
            macros: [
              { id: 10, name: "Sync Now", description: "Run a sync", ord: 0 },
            ],
          },
        ];
      }
      return [];
    });
    render(<SidebarContent />);
    await waitFor(() => {
      expect(screen.getByText("Sync Now")).toBeInTheDocument();
    });
    expect(screen.getByText("Daily")).toBeInTheDocument();
  });
});

describe("SidebarContent — static nav items", () => {
  test("renders all the static nav items", () => {
    mockFetch(() => ({}));
    mockUsePathname.mockReturnValue("/other");
    render(<SidebarContent />);
    for (const label of ["History", "Schedules", "NZB Viewer", "Debrid Viewer", "Log Viewer", "Database", "Admin", "Config", "Scraper"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("SidebarContent — macro click", () => {
  test("clicking a local macro on / dispatches a macro:run event", async () => {
    mockUsePathname.mockReturnValue("/");
    mockFetch((url) => {
      if (url.includes("/api/real-debrid/status")) return { label: "Premium", ok: true };
      if (url.includes("/api/macros")) {
        return [
          {
            group: { id: 1, name: "G", ord: 0 },
            macros: [
              { id: 42, name: "Local Macro", description: "", ord: 0 },
            ],
          },
        ];
      }
      return [];
    });
    const events: CustomEvent[] = [];
    const listener = (e: Event) => {
      events.push(e as CustomEvent);
    };
    window.addEventListener("macro:run", listener);
    try {
      render(<SidebarContent />);
      await waitFor(() => {
        expect(screen.getByText("Local Macro")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Local Macro"));
      expect(events.length).toBe(1);
      expect(events[0].detail).toEqual({ macroId: 42 });
    } finally {
      window.removeEventListener("macro:run", listener);
    }
  });

  test("clicking a local macro off / pushes a deep-link URL", async () => {
    mockUsePathname.mockReturnValue("/admin");
    mockFetch((url) => {
      if (url.includes("/api/real-debrid/status")) return { label: "Premium", ok: true };
      if (url.includes("/api/macros")) {
        return [
          {
            group: { id: 1, name: "G", ord: 0 },
            macros: [
              { id: 42, name: "Local Macro", description: "", ord: 0 },
            ],
          },
        ];
      }
      return [];
    });
    render(<SidebarContent />);
    await waitFor(() => {
      expect(screen.getByText("Local Macro")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Local Macro"));
    expect(mockPush).toHaveBeenCalledTimes(1);
    const calls = (mockPush.mock as { calls: unknown[][] }).calls;
    expect(calls[0]?.[0]).toBe("/?run_macro=42");
  });
});

describe("SidebarContent — Log Viewer badge", () => {
  test("shows the badge from /api/logs/alerts total", async () => {
    mockFetch((url) => {
      if (url.includes("/api/real-debrid/status")) return { label: "Premium", ok: true };
      if (url.includes("/api/macros")) return [];
      if (url.includes("/api/logs/alerts")) return { total: 7 };
      return {};
    });
    render(<SidebarContent />);
    await waitFor(() => {
      expect(screen.getByTitle("7 errors")).toBeInTheDocument();
    });
  });

  test("clears the badge immediately on log-alerts:acknowledged", async () => {
    mockFetch((url) => {
      if (url.includes("/api/real-debrid/status")) return { label: "Premium", ok: true };
      if (url.includes("/api/macros")) return [];
      if (url.includes("/api/logs/alerts")) return { total: 7 };
      return {};
    });
    render(<SidebarContent />);
    await waitFor(() => {
      expect(screen.getByTitle("7 errors")).toBeInTheDocument();
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent("log-alerts:acknowledged", { detail: { at: Date.now() } }));
    });

    expect(screen.queryByTitle("7 errors")).not.toBeInTheDocument();
  });

  test("ignores a stale /api/logs/alerts response after acknowledgement", async () => {
    const initialAlert = createDeferred<{ total: number }>();
    const staleAlert = createDeferred<{ total: number }>();
    let alertCallCount = 0;

    globalThis.fetch = mock(async (url: string) => {
      if (url.includes("/api/real-debrid/status")) {
        return new Response(JSON.stringify({ label: "Premium", ok: true }), { status: 200 });
      }
      if (url.includes("/api/macros")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/api/logs/alerts")) {
        alertCallCount++;
        if (alertCallCount === 1) return new Response(JSON.stringify(await initialAlert.promise), { status: 200 });
        if (alertCallCount === 2) return new Response(JSON.stringify(await staleAlert.promise), { status: 200 });
        return new Response(JSON.stringify({ total: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(<SidebarContent />);

    // Badge appears after the initial alert fetch resolves.
    await act(async () => {
      initialAlert.resolve({ total: 5 });
    });
    await waitFor(() => {
      expect(screen.getByTitle("5 errors")).toBeInTheDocument();
    });

    // Start a second alert fetch by triggering visibilitychange.
    await act(async () => {
      Object.defineProperty(document, "hidden", { value: false, writable: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(alertCallCount).toBe(2);

    // Fire acknowledgement while the second fetch is still in flight.
    await act(async () => {
      window.dispatchEvent(new CustomEvent("log-alerts:acknowledged", { detail: { at: Date.now() } }));
    });
    expect(screen.queryByTitle("5 errors")).not.toBeInTheDocument();

    // Resolve the stale second fetch with old counts.
    await act(async () => {
      staleAlert.resolve({ total: 5 });
    });

    // Badge must stay cleared.
    await waitFor(() => {
      expect(screen.queryByTitle("5 errors")).not.toBeInTheDocument();
    });
  });
});
