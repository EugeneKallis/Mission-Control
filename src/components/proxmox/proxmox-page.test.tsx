/**
 * ProxmoxPage component tests — render states: loading, not-configured, error, happy path.
 */

import { test, expect, mock, afterEach } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@/test-utils/render";

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

/** Two endpoints, three nodes — used for search-filtering tests. */
const MOCK_SEARCH_SNAPSHOT = {
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
        {
          node: "pve-2",
          status: "online",
          cpu: 0.1,
          maxcpu: 4,
          mem: 4_294_967_296,
          maxmem: 17_179_869_184,
          disk: 100_000_000_000,
          maxdisk: 250_000_000_000,
          uptime: 432000,
          vms: [
            { vmid: 300, name: "db-server", status: "running", cpu: 0.02, cpus: 2, mem: 2_147_483_648, maxmem: 4_294_967_296, disk: 0, maxdisk: 50_000_000_000, uptime: 86400 },
          ],
          containers: [
            { vmid: 400, name: "redis-ct", status: "running", cpu: 0.01, cpus: 1, mem: 268_435_456, maxmem: 536_870_912, disk: 5_000_000_000, maxdisk: 15_000_000_000, uptime: 86400 },
          ],
          storage: [
            { storage: "zfs-data", type: "zfspool", total: 1_000_000_000_000, used: 400_000_000_000, avail: 600_000_000_000, active: 1, enabled: 1 },
          ],
        },
      ],
    },
    {
      id: 2,
      name: "Backup Cluster",
      apiUrl: "https://192.168.1.20:8006",
      online: true,
      nodes: [
        {
          node: "bk-1",
          status: "online",
          cpu: 0.05,
          maxcpu: 2,
          mem: 2_147_483_648,
          maxmem: 8_589_934_592,
          disk: 50_000_000_000,
          maxdisk: 200_000_000_000,
          uptime: 2592000,
          vms: [],
          containers: [],
          storage: [
            { storage: "backup", type: "dir", total: 2_000_000_000_000, used: 500_000_000_000, avail: 1_500_000_000_000, active: 1, enabled: 1 },
          ],
        },
      ],
    },
  ],
  fetchedAt: new Date().toISOString(),
};

const SEARCH_ENDPOINTS = [
  { id: 1, name: "Main Cluster", apiUrl: "https://192.168.1.10:8006", apiToken: "", verifyTls: false, enabled: true, order: 0 },
  { id: 2, name: "Backup Cluster", apiUrl: "https://192.168.1.20:8006", apiToken: "", verifyTls: false, enabled: true, order: 1 },
];

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

// ── Live search ───────────────────────────────────────────────────────────

test("filters node cards and endpoint sections by the query, auto-expanding matches", async () => {
  mockFetch(MOCK_SEARCH_SNAPSHOT, 200, SEARCH_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  fireEvent.change(screen.getByRole("searchbox", { name: "Search Proxmox" }), {
    target: { value: "nginx" },
  });

  // Matching node stays, its card auto-expands on the LXC tab.
  expect(screen.getByText("pve-1")).toBeTruthy();
  expect(screen.getByRole("table", { name: "Main Cluster pve-1 LXC containers" })).toBeTruthy();
  expect(screen.getByText("nginx-ct")).toBeTruthy();

  // Non-matching node and endpoint section are hidden.
  expect(screen.queryByText("pve-2")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Backup Cluster" })).toBeNull();
});

test("auto-selects the VM tab when a VM name matches", async () => {
  mockFetch(MOCK_SEARCH_SNAPSHOT, 200, SEARCH_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  fireEvent.change(screen.getByRole("searchbox", { name: "Search Proxmox" }), {
    target: { value: "ubuntu" },
  });

  expect(screen.getByRole("table", { name: "Main Cluster pve-1 VMs" })).toBeTruthy();
  expect(screen.getByText("ubuntu-server")).toBeTruthy();
});

test("auto-expands nodes that match only at node or endpoint level", async () => {
  mockFetch(MOCK_SEARCH_SNAPSHOT, 200, SEARCH_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  // "Main" matches only the endpoint header — every node under it still
  // auto-expands even though no individual VM/LXC/storage row matches.
  fireEvent.change(screen.getByRole("searchbox", { name: "Search Proxmox" }), {
    target: { value: "Main" },
  });

  expect(screen.getByRole("table", { name: "Main Cluster pve-1 LXC containers" })).toBeTruthy();
  expect(screen.getByRole("table", { name: "Main Cluster pve-2 LXC containers" })).toBeTruthy();

  // A node-name-only match also auto-expands its card.
  fireEvent.change(screen.getByRole("searchbox", { name: "Search Proxmox" }), {
    target: { value: "pve-2" },
  });

  expect(screen.queryByRole("table", { name: "Main Cluster pve-1 LXC containers" })).toBeNull();
  expect(screen.getByRole("table", { name: "Main Cluster pve-2 LXC containers" })).toBeTruthy();
});

test("matching an endpoint header keeps that endpoint with all its nodes", async () => {
  mockFetch(MOCK_SEARCH_SNAPSHOT, 200, SEARCH_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  fireEvent.change(screen.getByRole("searchbox", { name: "Search Proxmox" }), {
    target: { value: "backup" },
  });

  expect(screen.getByRole("heading", { name: "Backup Cluster" })).toBeTruthy();
  expect(screen.getByText("bk-1")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Main Cluster" })).toBeNull();
});

test("shows a no-results state when nothing matches", async () => {
  mockFetch(MOCK_SEARCH_SNAPSHOT, 200, SEARCH_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  fireEvent.change(screen.getByRole("searchbox", { name: "Search Proxmox" }), {
    target: { value: "zzz-nothing" },
  });

  expect(screen.getByText(/No Proxmox resources match/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
});

test("clearing the search restores the full collapsed dashboard", async () => {
  mockFetch(MOCK_SEARCH_SNAPSHOT, 200, SEARCH_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  const input = screen.getByRole("searchbox", { name: "Search Proxmox" });
  fireEvent.change(input, { target: { value: "nginx" } });
  expect(screen.queryByText("pve-2")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

  // Everything is back and cards are collapsed again.
  expect((input as HTMLInputElement).value).toBe("");
  expect(screen.getByText("pve-2")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Backup Cluster" })).toBeTruthy();
  expect(screen.queryByText("nginx-ct")).toBeNull();
});

test("filters leaf rows inside an expanded card during a query", async () => {
  mockFetch(MOCK_SEARCH_SNAPSHOT, 200, SEARCH_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  fireEvent.change(screen.getByRole("searchbox", { name: "Search Proxmox" }), {
    target: { value: "nginx" },
  });

  // The LXC tab is auto-selected and only the matching container is shown;
  // non-matching guests (VM + sibling container) are filtered out.
  expect(screen.getByRole("table", { name: "Main Cluster pve-1 LXC containers" })).toBeTruthy();
  expect(screen.getByText("nginx-ct")).toBeTruthy();
  expect(screen.queryByText("redis-ct")).toBeNull();
  expect(screen.queryByText("ubuntu-server")).toBeNull();
});

test("respects a manual tab click during an active multi-category query", async () => {
  mockFetch(MOCK_SEARCH_SNAPSHOT, 200, SEARCH_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  // "running" matches VMs and containers on both nodes, so the VM tab is
  // auto-selected on each matching card.
  fireEvent.change(screen.getByRole("searchbox", { name: "Search Proxmox" }), {
    target: { value: "running" },
  });
  expect(screen.getByRole("table", { name: "Main Cluster pve-1 VMs" })).toBeTruthy();
  expect(screen.getByText("ubuntu-server")).toBeTruthy();

  // A user click on the LXC tab is respected instead of being overridden.
  const pve1Tablist = screen.getAllByRole("tablist").find(
    (tl) => tl.getAttribute("aria-label") === "pve-1 resource views",
  )!;
  fireEvent.click(within(pve1Tablist).getByRole("tab", { name: /^LXC/ }));

  const lxcTable = screen.getByRole("table", { name: "Main Cluster pve-1 LXC containers" });
  expect(lxcTable).toBeTruthy();
  expect(screen.getByText("nginx-ct")).toBeTruthy();
  // The matching VM still exists in the hidden VMs panel, so scope the
  // assertion to the active table.
  expect(within(lxcTable).queryByText("ubuntu-server")).toBeNull();
});

test("shows an empty-in-tab state when the selected tab has no matching rows", async () => {
  mockFetch(MOCK_SEARCH_SNAPSHOT, 200, SEARCH_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  fireEvent.change(screen.getByRole("searchbox", { name: "Search Proxmox" }), {
    target: { value: "nginx" },
  });
  fireEvent.click(screen.getByRole("tab", { name: /^VMs/ }));

  expect(screen.getByText("No VMs match the search")).toBeTruthy();
  expect(screen.queryByText("ubuntu-server")).toBeNull();
});

test("exposes disclosure and tab semantics during a search", async () => {
  mockFetch(MOCK_SEARCH_SNAPSHOT, 200, SEARCH_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  fireEvent.change(screen.getByRole("searchbox", { name: "Search Proxmox" }), {
    target: { value: "nginx" },
  });

  // The disclosure button name starts with the node name + status pill; sort
  // headers also contain "pve-1" in their aria-labels, so anchor on the prefix.
  const disclosure = screen.getByRole("button", { name: /^pve-1 online/ });
  expect(disclosure).toHaveAttribute("aria-expanded", "true");
  expect(disclosure).toHaveAttribute("aria-controls");

  const lxcTab = screen.getByRole("tab", { name: /^LXC/ });
  expect(lxcTab).toHaveAttribute("aria-selected", "true");
  expect(lxcTab).toHaveAttribute("aria-controls");

  const panel = document.getElementById(lxcTab.getAttribute("aria-controls")!);
  expect(panel).not.toBeNull();
  expect(panel).toHaveAttribute("role", "tabpanel");
  expect(panel).toHaveAttribute("aria-labelledby", lxcTab.id);
});

test("keeps NodeCard state on a later node when filtering changes its index", async () => {
  mockFetch(MOCK_SEARCH_SNAPSHOT, 200, SEARCH_ENDPOINTS);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  // Expand the second node and select its Storage tab (non-default).
  const pve2Disclosure = screen.getByRole("button", { name: /^pve-2 online/ });
  fireEvent.click(pve2Disclosure);
  const pve2Tablist = screen.getAllByRole("tablist").find(
    (tl) => tl.getAttribute("aria-label") === "pve-2 resource views",
  )!;
  fireEvent.click(within(pve2Tablist).getByRole("tab", { name: /^Storage/ }));

  // Confirm pve-2 shows the Storage table and its zfs-data pool.
  const pve2Panel = screen.getByRole("table", { name: "Main Cluster pve-2 storage" });
  expect(pve2Panel).toBeTruthy();
  expect(within(pve2Panel).getByText("zfs-data")).toBeTruthy();

  // Filter so pve-2 moves from index 1 to index 0 (pve-1 hidden).
  fireEvent.change(screen.getByRole("searchbox", { name: "Search Proxmox" }), {
    target: { value: "pve-2" },
  });

  // pve-1 must be hidden, and pve-2's manually selected Storage tab must survive.
  expect(screen.queryByText("pve-1")).toBeNull();
  const afterFilter = screen.getByRole("table", { name: "Main Cluster pve-2 storage" });
  expect(afterFilter).toBeTruthy();
  // The query matches the node name, not the storage pool name, so leaf filtering
  // hides the pool row but the Storage tab selection survives the index change.
  const storageTab = screen.getByRole("tab", { name: /^Storage/ });
  expect(storageTab).toHaveAttribute("aria-selected", "true");
  expect(within(afterFilter).queryByText("zfs-data")).toBeNull();
  expect(within(afterFilter).getByText("No storage pools match the search")).toBeTruthy();

  // Clearing the search restores the default collapsed view.
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  await waitFor(() => expect(screen.getByText("pve-1")).toBeTruthy());
  expect(screen.getByText("pve-2")).toBeTruthy();
});
