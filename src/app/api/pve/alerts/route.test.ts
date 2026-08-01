/**
 * Tests for GET /api/pve/alerts
 *
 * Uses the cached PVE snapshot path: mock the DB and queries module, then
 * feed fake snapshot data via a mock ProxmoxClient.
 */

import { test, expect, mock, afterEach } from "bun:test";

mock.module("@/lib/db", () => ({
  default: {},
  db: {},
}));

const mockListEndpoints = mock<(opts?: any) => any[]>();
const mockGetPveThresholds = mock<() => any>();

mock.module("@/lib/db/queries", () => ({
  listProxmoxEndpoints: mockListEndpoints,
  getPveThresholds: mockGetPveThresholds,
}));

const mockGetSnapshot = mock<() => any>();

mock.module("@/lib/clients/proxmox", () => ({
  ProxmoxClient: mock((url: string, token: string, verifyTls: boolean) => ({
    getSnapshot: mockGetSnapshot,
  })),
}));

import { GET } from "./route";
import { clearPveStatusCache } from "@/lib/pve-status";

function makeSnapshot(cpu: number, mem: number, disk: number, storageUsed: number) {
  return {
    id: 1,
    name: "Main",
    apiUrl: "https://pve1:8006",
    online: true,
    nodes: [
      {
        node: "pve-1",
        status: "online",
        cpu: 0.1,
        maxcpu: 8,
        mem: 8_000_000_000,
        maxmem: 32_000_000_000,
        disk: 200_000_000_000,
        maxdisk: 500_000_000_000,
        uptime: 86400,
        vms: [
          {
            vmid: 100,
            name: "vm1",
            status: "running",
            cpu: cpu / 100,
            cpus: 4,
            mem: mem,
            maxmem: 8_000_000_000,
            disk: disk,
            maxdisk: 100_000_000_000,
            uptime: 3600,
          },
        ],
        containers: [],
        storage: [
          {
            storage: "local",
            type: "dir",
            total: 100,
            used: storageUsed,
            avail: 100 - storageUsed,
          },
        ],
      },
    ],
  };
}

afterEach(() => {
  clearPveStatusCache();
  mockListEndpoints.mockClear();
  mockGetPveThresholds.mockClear();
  mockGetSnapshot.mockClear();
});

test("returns zero alerts when all metrics are within thresholds", async () => {
  mockListEndpoints.mockReturnValue([{ id: 1, name: "Main", apiUrl: "https://pve1:8006", apiToken: "tok", verifyTls: false, enabled: true, order: 0 }]);
  mockGetSnapshot.mockResolvedValue(makeSnapshot(50, 4_000_000_000, 20_000_000_000, 50));
  mockGetPveThresholds.mockResolvedValue({ cpu: 80, memory: 80, storage: 80 });

  const res = await GET();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.count).toBe(0);
  expect(body.thresholds.cpu).toBe(80);
});

test("counts VM, storage, and thresholds in response", async () => {
  mockListEndpoints.mockReturnValue([{ id: 1, name: "Main", apiUrl: "https://pve1:8006", apiToken: "tok", verifyTls: false, enabled: true, order: 0 }]);
  mockGetSnapshot.mockResolvedValue(makeSnapshot(90, 7_500_000_000, 90_000_000_000, 90));
  mockGetPveThresholds.mockResolvedValue({ cpu: 80, memory: 80, storage: 80 });

  const res = await GET();
  const json = await res.json();
  expect(json.count).toBe(2);
});

test("returns configured thresholds even when snapshot is empty", async () => {
  mockListEndpoints.mockReturnValue([]);
  mockGetSnapshot.mockResolvedValue({ endpoints: [], fetchedAt: new Date().toISOString() });
  mockGetPveThresholds.mockResolvedValue({ cpu: 60, memory: 70, storage: 90 });

  const res = await GET();
  const json = await res.json();
  expect(json.count).toBe(0);
  expect(json.thresholds).toEqual({ cpu: 60, memory: 70, storage: 90 });
});
