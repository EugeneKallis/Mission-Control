/**
 * Unit tests for src/components/layout/sidebar-content.tsx
 *
 * The component:
 *  - fetches /api/real-debrid/status on mount
 *  - fetches /api/macros on mount
 *  - renders a static set of NavItems
 *  - dispatches "macro:run" or "macro:run-agent" events on macro click
 *
 * Strategy: mock next/navigation and globalThis.fetch; the render output
 * is fully deterministic.
 */
import { describe, test, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@/test-utils/render";

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

afterEach(() => {
  globalThis.fetch = originalFetch;
  mockPush.mockReset();
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
              { id: 10, name: "Sync Now", description: "Run a sync", runOnAgent: false, agentHostname: null, ord: 0 },
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

  test("marks runOnAgent macros with the AGENT badge", async () => {
    mockFetch((url) => {
      if (url.includes("/api/real-debrid/status")) return { label: "Premium", ok: true };
      if (url.includes("/api/macros")) {
        return [
          {
            group: { id: 1, name: "Agents", ord: 0 },
            macros: [
              { id: 11, name: "Remote Run", description: "", runOnAgent: true, agentHostname: "host-1", ord: 0 },
            ],
          },
        ];
      }
      return [];
    });
    render(<SidebarContent />);
    await waitFor(() => {
      expect(screen.getByText("Remote Run")).toBeInTheDocument();
    });
    expect(screen.getByText("AGENT")).toBeInTheDocument();
  });
});

describe("SidebarContent — static nav items", () => {
  test("renders all the static nav items", () => {
    mockFetch(() => ({}));
    mockUsePathname.mockReturnValue("/other");
    render(<SidebarContent />);
    for (const label of ["History", "Schedules", "NZB Viewer", "Debrid Viewer", "Server Status", "Log Viewer", "Database", "Admin", "Config", "Scraper"]) {
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
              { id: 42, name: "Local Macro", description: "", runOnAgent: false, agentHostname: null, ord: 0 },
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
      expect(events[0].detail).toEqual({ macroId: 42, agent: undefined });
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
              { id: 42, name: "Local Macro", description: "", runOnAgent: false, agentHostname: null, ord: 0 },
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

  test("clicking a local macro off / with an agent pushes the agent in the URL", async () => {
    mockUsePathname.mockReturnValue("/admin");
    mockFetch((url) => {
      if (url.includes("/api/real-debrid/status")) return { label: "Premium", ok: true };
      if (url.includes("/api/macros")) {
        return [
          {
            group: { id: 1, name: "G", ord: 0 },
            macros: [
              { id: 42, name: "Agent Macro", description: "", runOnAgent: false, agentHostname: "host-x", ord: 0 },
            ],
          },
        ];
      }
      return [];
    });
    render(<SidebarContent />);
    await waitFor(() => {
      expect(screen.getByText("Agent Macro")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Agent Macro"));
    expect(mockPush).toHaveBeenCalledTimes(1);
    const calls = (mockPush.mock as { calls: unknown[][] }).calls;
    expect(calls[0]?.[0]).toBe("/?run_macro=42&agent=host-x");
  });

  test("clicking a runOnAgent macro without a hostname dispatches macro:run-agent", async () => {
    mockFetch((url) => {
      if (url.includes("/api/real-debrid/status")) return { label: "Premium", ok: true };
      if (url.includes("/api/macros")) {
        return [
          {
            group: { id: 1, name: "G", ord: 0 },
            macros: [
              { id: 77, name: "Pick Agent", description: "", runOnAgent: true, agentHostname: null, ord: 0 },
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
    window.addEventListener("macro:run-agent", listener);
    try {
      render(<SidebarContent />);
      await waitFor(() => {
        expect(screen.getByText("Pick Agent")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText("Pick Agent"));
      expect(events.length).toBe(1);
      expect(events[0].detail).toEqual({ macroId: 77, macroName: "Pick Agent" });
    } finally {
      window.removeEventListener("macro:run-agent", listener);
    }
  });
});
