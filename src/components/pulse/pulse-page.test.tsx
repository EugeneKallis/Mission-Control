import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/render";
import { PULSE_URL } from "@/lib/pulse";
import { PulsePage } from "./pulse-page";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

function mockStatus(body: unknown, status = 200) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("PulsePage", () => {
  test("shows loading while the status request is pending", () => {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    render(<PulsePage />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading Pulse status");
  });

  test("renders healthy status and public metrics", async () => {
    mockStatus({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      health: { status: "healthy", uptime: 7_200, dependencies: { monitor: true, scheduler: true } },
      version: { version: "6.2.1", build: "release" },
      security: { requiresAuth: true, ssoEnabled: false },
      resources: [
        { id: "host-1", name: "pve-01", type: "agent", status: "online", node: "pve-01" },
        { id: "vm-100", name: "media-vm", type: "vm", status: "running", node: "pve-01" },
        { id: "docker-1", name: "docker-host", type: "docker-host", status: "healthy", host: "docker-01" },
      ],
      resourceCount: 3,
      authenticated: true,
      errors: [],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Operational")).toBeInTheDocument());
    expect(screen.getByText("2h 0m")).toBeInTheDocument();
    expect(screen.getByText("6.2.1")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Authenticated API")).toBeInTheDocument();
    expect(screen.getByText("Monitored resources")).toBeInTheDocument();
    expect(screen.getByText("media-vm")).toBeInTheDocument();
    expect(screen.getAllByText("docker-host").length).toBeGreaterThan(0);
  });

  test("filters resources by search and group", async () => {
    mockStatus({
      health: { status: "healthy" },
      resources: [
        { name: "pve-01", type: "agent", source: "proxmox", status: "online" },
        { name: "docker-01", type: "docker-host", source: "docker", status: "healthy" },
      ],
      resourceCount: 2,
      authenticated: true,
      errors: [],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Monitored resources")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Filter resources"), { target: { value: "Docker" } });
    expect(screen.getByRole("row", { name: /docker-01/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /pve-01/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search resources"), { target: { value: "missing" } });
    expect(screen.getByText("No resources match the current filter.")).toBeInTheDocument();
  });

  test("renders guest metrics with utilization bars and collapsible type groups", async () => {
    mockStatus({
      health: { status: "healthy" },
      resources: [
        {
          id: "qemu/100",
          vmid: 100,
          name: "media-vm",
          type: "qemu",
          status: "running",
          cpu: 0.82,
          mem: 7_000_000_000,
          maxmem: 8_000_000_000,
          disk: { current: 95, used: 95_000_000_000, total: 100_000_000_000 },
          uptime: 90_000,
          netin: 1_000_000,
          netout: 2_000_000,
          diskread: 3_000_000,
          diskwrite: 4_000_000,
        },
        { id: "lxc/200", name: "download-ct", type: "lxc", status: "running" },
      ],
      resourceCount: 2,
      authenticated: true,
      errors: [],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Monitored resources")).toBeInTheDocument());
    expect(screen.getByText("VM")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("1d 1h 0m")).toBeInTheDocument();
    expect(screen.getByText(/↓ 976\.6 KB ↑ 1\.9 MB/)).toBeInTheDocument();
    expect(screen.getByText(/R 2\.9 MB W 3\.8 MB/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "cpu utilization" })).toHaveAttribute("aria-valuenow", "82");
    expect(screen.getByRole("progressbar", { name: "memory utilization" })).toHaveAttribute("aria-valuenow", "88");
    expect(screen.getByRole("progressbar", { name: "disk utilization" })).toHaveAttribute("aria-valuenow", "95");
    expect(screen.getByRole("progressbar", { name: "disk utilization" }).firstElementChild?.className).toContain("bg-error");

    expect(screen.getByRole("button", { name: "Collapse VMs group" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse LXCs group" })).toBeInTheDocument();
  });

  test("orders groups, hides Docker metadata, and collapses remaining types", async () => {
    mockStatus({
      health: { status: "healthy" },
      resources: [
        { name: "disk-array", type: "storage", status: "online" },
        { name: "app-01", type: "container", source: "docker", status: "running" },
        { name: "vm-01", type: "qemu", status: "running" },
        { name: "ct-01", type: "lxc", status: "running" },
        { name: "host-01", type: "agent", status: "online" },
        { name: "base-image", type: "docker-image" },
        { name: "app-network", type: "docker-network" },
        { name: "app-volume", type: "docker-volume" },
      ],
      resourceCount: 8,
      authenticated: true,
      errors: [],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Monitored resources")).toBeInTheDocument());

    const groups = [
      screen.getByRole("button", { name: "Collapse Host group" }),
      screen.getByRole("button", { name: "Collapse LXCs group" }),
      screen.getByRole("button", { name: "Collapse VMs group" }),
      screen.getByRole("button", { name: "Collapse Docker containers group" }),
      screen.getByRole("button", { name: "Expand Storage group" }),
    ];
    for (let index = 1; index < groups.length; index += 1) {
      expect(groups[index - 1].compareDocumentPosition(groups[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    expect(screen.queryByText("base-image")).not.toBeInTheDocument();
    expect(screen.queryByText("app-network")).not.toBeInTheDocument();
    expect(screen.queryByText("app-volume")).not.toBeInTheDocument();
    expect(screen.queryByText("disk-array")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand Storage group" }));
    expect(screen.getByRole("row", { name: /disk-array/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse Storage group" }));
    expect(screen.queryByRole("row", { name: /disk-array/ })).not.toBeInTheDocument();
  });

  test("sorts resources independently within each group", async () => {
    mockStatus({
      health: { status: "healthy" },
      resources: [
        { name: "vm-10", type: "qemu", status: "running" },
        { name: "vm-2", type: "qemu", status: "running" },
        { name: "host-2", type: "agent", status: "online" },
        { name: "host-1", type: "agent", status: "online" },
      ],
      resourceCount: 4,
      authenticated: true,
      errors: [],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Monitored resources")).toBeInTheDocument());

    const hostRows = [
      screen.getByRole("row", { name: /host-1/ }),
      screen.getByRole("row", { name: /host-2/ }),
    ];
    const vmRows = [
      screen.getByRole("row", { name: /vm-2/ }),
      screen.getByRole("row", { name: /vm-10/ }),
    ];

    expect(hostRows[0].compareDocumentPosition(hostRows[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vmRows[0].compareDocumentPosition(vmRows[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("sorts each group's columns independently when headers are clicked", async () => {
    mockStatus({
      health: { status: "healthy" },
      resources: [
        { name: "vm-1", type: "qemu", status: "running" },
        { name: "vm-2", type: "qemu", status: "running" },
        { name: "host-1", type: "agent", status: "online" },
        { name: "host-2", type: "agent", status: "online" },
      ],
      resourceCount: 4,
      authenticated: true,
      errors: [],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Monitored resources")).toBeInTheDocument());

    const nameHeaders = screen.getAllByRole("button", { name: "Sort Name descending" });
    fireEvent.click(nameHeaders[1]);

    const vmRows = [
      screen.getByRole("row", { name: /vm-2/ }),
      screen.getByRole("row", { name: /vm-1/ }),
    ];
    const hostRows = [
      screen.getByRole("row", { name: /host-1/ }),
      screen.getByRole("row", { name: /host-2/ }),
    ];
    expect(vmRows[0].compareDocumentPosition(vmRows[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hostRows[0].compareDocumentPosition(hostRows[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("keeps multi-core CPU fractions high and preserves explicit percent values", async () => {
    mockStatus({
      health: { status: "healthy" },
      resources: [
        { name: "busy-vm", type: "qemu", cpu: 1.5 },
        { name: "light-vm", type: "qemu", cpuPercent: 1 },
      ],
      resourceCount: 2,
      authenticated: true,
      errors: [],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Monitored resources")).toBeInTheDocument());
    const cpuBars = screen.getAllByRole("progressbar", { name: "cpu utilization" });
    expect(cpuBars[0]).toHaveAttribute("aria-valuenow", "100");
    expect(cpuBars[0].firstElementChild?.className).toContain("bg-error");
    expect(cpuBars[1]).toHaveAttribute("aria-valuenow", "1");
    expect(cpuBars[1].firstElementChild?.className).toContain("bg-primary");
  });

  test("renders an empty state for an authenticated account with no resources", async () => {
    mockStatus({ health: { status: "healthy" }, resources: [], resourceCount: 0, authenticated: true, errors: [] });
    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Pulse reported no monitored resources.")).toBeInTheDocument());
  });

  test("renders degraded status and partial-data warning", async () => {
    mockStatus({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      health: { status: "degraded", dependencies: { monitor: true, websocket: false } },
      version: null,
      security: null,
      errors: ["/api/version: unavailable"],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Degraded")).toBeInTheDocument());
    expect(screen.getByText(/Some public Pulse details could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText("/api/version: unavailable")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  test("renders an actionable direct link when Pulse is unavailable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Pulse public API is unavailable");
    }) as unknown as typeof fetch;

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Open Pulse directly" }).getAttribute("href")).toBe(PULSE_URL);
  });

  test("shows upstream error details when the status route fails", async () => {
    mockStatus({ errors: ["/api/health: connection refused"] }, 502);

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("/api/health: connection refused")).toBeInTheDocument();
  });

  test("hints at a rejected key when authenticated resources yield no count", async () => {
    mockStatus({
      health: { status: "healthy", dependencies: { monitor: true } },
      version: { version: "6.2.1" },
      security: { requiresAuth: true },
      resourceCount: null,
      authenticated: true,
      resourcesError: "/api/resources returned HTTP 401",
      errors: ["/api/resources returned HTTP 401"],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Operational")).toBeInTheDocument());
    expect(screen.getByText(/Key rejected or resources unavailable/)).toBeInTheDocument();
    expect(screen.getByText("/api/resources returned HTTP 401")).toBeInTheDocument();
  });

  test("keeps the full Pulse link available from the native dashboard", async () => {
    mockStatus({ health: { status: "healthy" }, version: {}, security: {}, errors: [] });
    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Operational")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Full Pulse" }).getAttribute("href")).toBe(PULSE_URL);
    expect(screen.getByRole("link", { name: "Open authenticated Pulse dashboard" }).getAttribute("href")).toBe(PULSE_URL);
  });
});
