/**
 * ProxmoxPage component tests — render states: loading, not-configured, error, happy path.
 */

import { test, expect, mock, afterEach } from "bun:test";
import { render, screen } from "@/test-utils/render";

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

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Mock fetch routed by URL: /api/pve/status gets the snapshot, everything
 * else (the endpoints list) gets an empty array.
 */
function mockFetch(data: unknown, status = 200) {
  globalThis.fetch = mock((url: string | URL | Request) => {
    const path = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const body = path.includes("/api/pve/status") ? data : [];
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
  expect(screen.getByText("Loading…")).toBeTruthy();
});

test("renders not-configured state when no endpoints exist", async () => {
  mockFetch({ endpoints: [], fetchedAt: new Date().toISOString() });
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  // Wait for effects to run
  await new Promise((r) => setTimeout(r, 10));

  expect(screen.getByText("No Proxmox servers configured")).toBeTruthy();
  expect(screen.getByText(/add your Proxmox API endpoint/)).toBeTruthy();
});

test("renders endpoint with nodes and guests", async () => {
  mockFetch(MOCK_SNAPSHOT);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  // Endpoint header
  expect(screen.getByText("Main Cluster")).toBeTruthy();
  expect(screen.getByText("Online")).toBeTruthy();

  // Node name
  expect(screen.getByText("pve-1")).toBeTruthy();

  // Summary stats in header
  expect(screen.getByText(/1 endpoint/)).toBeTruthy();
  expect(screen.getByText(/node/)).toBeTruthy();
  expect(screen.getByText(/1 VM/)).toBeTruthy();
  expect(screen.getByText(/1 LXC/)).toBeTruthy();
});

test("renders error state on fetch failure", async () => {
  mockFetch({ error: "Failed to fetch Proxmox status" }, 500);
  const { ProxmoxPage } = await import("./proxmox-page?bust=" + Math.random());

  render(<ProxmoxPage />);
  await new Promise((r) => setTimeout(r, 10));

  expect(screen.getByText("Failed to fetch Proxmox status")).toBeTruthy();
  expect(screen.getByText("Retry")).toBeTruthy();
});
