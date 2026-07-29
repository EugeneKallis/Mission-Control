/**
 * ProxmoxPage component tests — render states: loading, not-configured, error, happy path.
 */

import { test, expect, mock, afterEach } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@/test-utils/render";

// ── Fixtures ───────────────────────────────────────────────────────────────

const MOCK_SNAPSHOT = {
  endpoints: [
    {
      id: 1,
      name: "Main Cluster",
      apiUrl: "https://192.168.1.10:8006",
      online: true,
      nodes: [
        {
          node: "pve-1",
          status: "online",
          cpu: 0.15,
          maxcpu: 8,
          mem: 8_589_934_592,
          maxmem: 34_359_738_368,
          disk: 200_000_000_000,
          maxdisk: 500_000_000_000,
          uptime: 604800,
          vms: [
            { vmid: 100, name: "ubuntu-server", status: "running", cpu: 0.05, cpus: 4, mem: 4_294_967_296, maxmem: 8_589_934_592, disk: 0, maxdisk: 100_000_000_000, uptime: 86400 },
          ],
          containers: [
            { vmid: 200, name: "nginx-ct", status: "running", cpu: 0.01, cpus: 2, mem: 536_870_912, maxmem: 1_073_741_824, disk: 10_000_000_000, maxdisk: 30_000_000_000, uptime: 172800 },
          ],
          storage: [
            { storage: "local", type: "dir", total: 500_000_000_000, used: 300_000_000_000, avail: 200_000_000_000, active: 1, enabled: 1 },
          ],
        },
      ],
    },
  ],
  fetchedAt: new Date().toISOString(),
};

const MOCK_SNAPSHOT_OFFLINE = {
  endpoints: [
    {
      id: 1,
      name: "Offline Cluster",
      apiUrl: "https://192.168.1.99:8006",
      online: false,
      error: "Connection refused",
      nodes: [],
    },
  ],
  fetchedAt: new Date().toISOString(),
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Mock fetch routed by URL: /api/pve/status gets the snapshot, /api/pve/endpoints
 * gets endpoints list, everything else gets an empty array.
 */
const DEFAULT_ENDPOINTS = [
  { id: 1, name: "Main Cluster", apiUrl: "https://192.168.1.10:8006", apiToken: "", verifyTls: false, enabled: true, order: 0 },
];

function mockFetch(data: unknown, status = 200, endpoints = DEFAULT_ENDPOINTS) {
  globalThis.fetch = mock((url: string | URL | Request) => {
    const path = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    let body: unknown;
    if (path.includes("/api/pve/status")) {
      body = data;
    } else if (path.includes("/api/pve/endpoints")) {
      body = endpoints;
    } else {
      body = [];
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    );
  }) as unknown as typeof globalThis.fetch;
}

test("renders loading state initially", async () => {
  // Don't resolve fetch — leave it pending to keep loading state
  globalThis.fetch = mock(() => new Promise(() => {})) as unknown as typeof globalThis.fetch;

  const { ProxmoxPage } = await import("./proxmox-page");
  render(<ProxmoxPage />);
  expect(screen.getByText(/Loading.*status/)).toBeTruthy();
});

test("renders not-configured state when no endpoints exist", async () => {
  mockFetch({ endpoints: [], fetchedAt: new Date().toISOString() }, 200, []);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  // Wait for effects to run
  await new Promise((r) => setTimeout(r, 10));

  expect(screen.getByText("No Proxmox endpoints configured.")).toBeTruthy();
  expect(screen.getByText("Add Endpoint")).toBeTruthy();
});

test("renders endpoint with nodes and guests", async () => {
  mockFetch(MOCK_SNAPSHOT);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  // Node name
  expect(screen.getByText("pve-1")).toBeTruthy();

  // Endpoint name (from configured endpoints list)
  expect(screen.getByRole("heading", { name: "Main Cluster" })).toBeTruthy();

  // Summary stats in header
  expect(screen.getByText(/1 endpoint/)).toBeTruthy();
  expect(screen.getByText(/1 VM/)).toBeTruthy();
  expect(screen.getByText(/1 container/)).toBeTruthy();
});

test("renders error state on fetch failure (no data)", async () => {
  mockFetch({ error: "Internal error" }, 500);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  expect(screen.getByText("Server error")).toBeTruthy();
  expect(screen.getByText("Cluster status is temporarily unavailable.")).toBeTruthy();
  expect(screen.queryByText(/No endpoints are enabled/)).toBeNull();
  expect(screen.getByText("Refresh")).toBeTruthy();
});

test("keeps stale status visible and reports a failed refresh", async () => {
  let statusCalls = 0;
  globalThis.fetch = mock((url: string | URL | Request) => {
    const path = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (path.includes("/api/pve/status")) {
      statusCalls += 1;
      if (statusCalls === 1) {
        return Promise.resolve(new Response(JSON.stringify(MOCK_SNAPSHOT), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: "Unavailable" }), { status: 500 }));
    }
    return Promise.resolve(new Response(JSON.stringify(DEFAULT_ENDPOINTS), { status: 200 }));
  }) as unknown as typeof globalThis.fetch;

  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());
  render(<ProxmoxPage />);

  await waitFor(() => expect(screen.getByText("pve-1")).toBeTruthy());
  fireEvent.click(screen.getByText("Refresh"));

  await waitFor(() => {
    expect(screen.getByText(/Refresh failed — showing last known status/)).toBeTruthy();
  });
  expect(screen.getByText("pve-1")).toBeTruthy();
});

test("shows online status pill for a healthy endpoint", async () => {
  mockFetch(MOCK_SNAPSHOT);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  expect(screen.getByText("Online")).toBeTruthy();
});

test("shows offline status and error detail for a failed endpoint", async () => {
  const endpoints = [
    { id: 1, name: "Offline Cluster", apiUrl: "https://192.168.1.99:8006", apiToken: "", verifyTls: false, enabled: true, order: 0 },
  ];
  mockFetch(MOCK_SNAPSHOT_OFFLINE, 200, endpoints);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  expect(screen.getByText("Offline")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Offline Cluster" })).toBeTruthy();
  expect(screen.getByText(/Connection refused/)).toBeTruthy();
});

test("shows endpoint URL next to the endpoint name", async () => {
  mockFetch(MOCK_SNAPSHOT);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  // The endpoint name should be "Main Cluster" (from endpoints list) not the raw URL
  expect(screen.getByRole("heading", { name: "Main Cluster" })).toBeTruthy();
  // The URL should also appear as metadata (in the font-mono span)
  const urlSpans = screen.getAllByText("https://192.168.1.10:8006");
  expect(urlSpans.length).toBeGreaterThanOrEqual(1);
});

test("shows last-updated timestamp", async () => {
  const snapshot = {
    ...MOCK_SNAPSHOT,
    fetchedAt: "2025-01-15T12:00:00.000Z",
  };
  mockFetch(snapshot, 200, DEFAULT_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  expect(screen.getByText(/Last updated/)).toBeTruthy();
});

test("shows no-nodes placeholder when endpoint has zero nodes", async () => {
  const snapshot = {
    endpoints: [
      {
        id: 1,
        name: "Empty Cluster",
        apiUrl: "https://192.168.1.10:8006",
        online: true,
        nodes: [],
      },
    ],
    fetchedAt: new Date().toISOString(),
  };
  const endpoints = [
    { id: 1, name: "Empty Cluster", apiUrl: "https://192.168.1.10:8006", apiToken: "", verifyTls: false, enabled: true, order: 0 },
  ];
  mockFetch(snapshot, 200, endpoints);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  expect(screen.getByText("No nodes available on this endpoint.")).toBeTruthy();
});

test("does not show not-configured empty state alongside error", async () => {
  // When there are endpoints but they failed, we should NOT show
  // "No Proxmox endpoints configured."
  const endpoints = [
    { id: 1, name: "Offline Cluster", apiUrl: "https://192.168.1.99:8006", apiToken: "", verifyTls: false, enabled: true, order: 0 },
  ];
  mockFetch(MOCK_SNAPSHOT_OFFLINE, 200, endpoints);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  expect(screen.queryByText("No Proxmox endpoints configured.")).toBeNull();
  // Should show the per-endpoint error instead
  // The heading still shows the endpoint name
  expect(screen.getByRole("heading", { name: "Offline Cluster" })).toBeTruthy();
});
