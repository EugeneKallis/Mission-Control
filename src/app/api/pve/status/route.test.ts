/**
 * Tests for GET /api/pve/status
 *
 * Must be its own file because mock.module("@/lib/db") is process-global.
 */

import { test, expect, mock, afterEach } from "bun:test";

// ── Mock DB before importing route ──────────────────────────────────────────

mock.module("@/lib/db", () => ({
  default: {},
  db: {},
}));

// Mock the queries module
const mockListEndpoints = mock<(opts?: any) => any[]>();
const mockGetProxmoxEndpoint = mock<(id: number) => any>();

mock.module("@/lib/db/queries", () => ({
  listProxmoxEndpoints: mockListEndpoints,
  getProxmoxEndpoint: mockGetProxmoxEndpoint,
}));

// Mock the ProxmoxClient
const mockGetSnapshot = mock<() => any>();

mock.module("@/lib/clients/proxmox", () => ({
  ProxmoxClient: mock((url: string, token: string, verifyTls: boolean) => ({
    getSnapshot: mockGetSnapshot,
  })),
}));

import { GET } from "./route";
import { clearPveStatusCache } from "@/lib/pve-status";

afterEach(() => {
  clearPveStatusCache();
  mockListEndpoints.mockClear();
  mockGetProxmoxEndpoint.mockClear();
  mockGetSnapshot.mockClear();
});

test("returns empty when no endpoints configured", async () => {
  mockListEndpoints.mockReturnValue([]);
  const res = await GET();
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.endpoints).toEqual([]);
  expect(json.fetchedAt).toBeDefined();
});

test("returns per-endpoint snapshot", async () => {
  mockListEndpoints.mockReturnValue([
    { id: 1, name: "Main", apiUrl: "https://pve1:8006", apiToken: "tok1", verifyTls: false, enabled: true, order: 0 },
  ]);
  mockGetSnapshot.mockResolvedValue({
    id: 0,
    name: "https://pve1:8006",
    apiUrl: "https://pve1:8006",
    online: true,
    nodes: [
      {
        node: "pve-1",
        status: "online",
        cpu: 0.15,
        maxcpu: 8,
        mem: 8_000_000_000,
        maxmem: 32_000_000_000,
        disk: 200_000_000_000,
        maxdisk: 500_000_000_000,
        uptime: 86400,
        vms: [{ vmid: 100, name: "vm1", status: "running", cpu: 0.05, cpus: 2, mem: 2_000_000_000, maxmem: 4_000_000_000, disk: 0, maxdisk: 50_000_000_000, uptime: 3600 }],
        containers: [{ vmid: 200, name: "ct1", status: "running", cpu: 0.01, cpus: 1, mem: 500_000_000, maxmem: 1_000_000_000, disk: 10_000_000_000, maxdisk: 30_000_000_000, uptime: 7200 }],
        storage: [{ storage: "local", type: "dir", total: 500_000_000_000, used: 300_000_000_000, avail: 200_000_000_000, active: 1, enabled: 1 }],
      },
    ],
  });

  const res = await GET();
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.endpoints).toHaveLength(1);
  expect(json.endpoints[0].name).toBe("Main");
  expect(json.endpoints[0].online).toBe(true);
  expect(json.endpoints[0].nodes).toHaveLength(1);
  expect(json.endpoints[0].nodes[0].vms).toHaveLength(1);
  expect(json.endpoints[0].nodes[0].containers).toHaveLength(1);
  expect(json.endpoints[0].nodes[0].storage).toHaveLength(1);
});

test("handles endpoint fetch failure gracefully", async () => {
  mockListEndpoints.mockReturnValue([
    { id: 1, name: "Broken", apiUrl: "https://broken:8006", apiToken: "tok", verifyTls: true, enabled: true, order: 0 },
  ]);
  mockGetSnapshot.mockRejectedValue(new Error("Connection refused"));

  const res = await GET();
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.endpoints).toHaveLength(1);
  expect(json.endpoints[0].online).toBe(false);
  expect(json.endpoints[0].error).toContain("Connection refused");
  expect(json.endpoints[0].nodes).toEqual([]);
});

test("skips disabled endpoints", async () => {
  mockListEndpoints.mockReturnValue([
    { id: 1, name: "Enabled", apiUrl: "https://pve1:8006", apiToken: "tok", verifyTls: true, enabled: true, order: 0 },
    { id: 2, name: "Disabled", apiUrl: "https://pve2:8006", apiToken: "tok", verifyTls: true, enabled: false, order: 1 },
  ]);
  mockGetSnapshot.mockResolvedValue({
    id: 0, name: "https://pve1:8006", apiUrl: "https://pve1:8006", online: true, nodes: [],
  });

  const res = await GET();
  const json = await res.json();
  expect(json.endpoints).toHaveLength(1); // only enabled
});
