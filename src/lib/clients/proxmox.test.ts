/**
 * Proxmox client unit tests — mock node:https.request to verify URL building,
 * auth headers, envelope unwrap, error handling, and snapshot aggregation.
 *
 * Must be in its own file because mock.module is process-global.
 */

import { test, expect, mock, afterEach } from "bun:test";

// ── Mock node:https BEFORE importing the client ────────────────────────────

type RequestCallback = (res: {
  statusCode?: number;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
}) => void;

type RequestOptions = Record<string, unknown>;
type RequestReturn = {
  on: (event: string, handler: (err?: Error) => void) => void;
  end: () => void;
};

const mockHttpsRequest = mock<(options: RequestOptions, callback: RequestCallback) => RequestReturn>();

mock.module("node:https", () => ({
  request: mockHttpsRequest,
}));

// Now it's safe to import the client (the mock is in place)
import { ProxmoxClient, type PveRawNode, type PveRawQemu, type PveRawLxc, type PveRawStorage } from "./proxmox";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Enqueue a single response for the mock. Each call to mockHttpsRequest
 * pulls one response from the queue and invokes the callback.
 */
function enqueueResponse(statusCode: number, body: unknown) {
  const json = JSON.stringify({ data: body });
  let resolved = false;

  mockHttpsRequest.mockImplementationOnce((_options: RequestOptions, callback: RequestCallback) => {
    if (resolved) throw new Error("response already consumed");
    resolved = true;

    const chunks: Buffer[] = [Buffer.from(json, "utf-8")];
    const res = {
      statusCode,
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === "data") {
          for (const chunk of chunks) handler(chunk);
        }
        if (event === "end") handler();
      },
    };
    callback(res);
    return {
      on: (_event: string, _handler: (err?: Error) => void) => {},
      end: () => {},
    };
  });
}

/**
 * Like enqueueResponse but allows a sequence of responses for multiple calls.
 * Each call to mockHttpsRequest returns the next response in order.
 */
function enqueueSequence(...responses: { status: number; body: unknown }[]) {
  for (const r of responses) {
    const json = JSON.stringify({ data: r.body });
    mockHttpsRequest.mockImplementationOnce((_options: RequestOptions, callback: RequestCallback) => {
      const chunks: Buffer[] = [Buffer.from(json, "utf-8")];
      const res = {
        statusCode: r.status,
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (event === "data") {
            for (const chunk of chunks) handler(chunk);
          }
          if (event === "end") handler();
        },
      };
      callback(res);
      return {
        on: (_event: string, _handler: (err?: Error) => void) => {},
        end: () => {},
      };
    });
  }
}

afterEach(() => {
  mockHttpsRequest.mockClear();
});

// ── Fixtures ───────────────────────────────────────────────────────────────

const NODE_FIXTURE: PveRawNode[] = [
  { node: "pve-1", status: "online", cpu: 0.15, maxcpu: 8, mem: 8_589_934_592, maxmem: 34_359_738_368, disk: 200_000_000_000, maxdisk: 500_000_000_000, uptime: 604800, type: "node", id: "node/pve-1", level: "c" },
  { node: "pve-2", status: "online", cpu: 0.08, maxcpu: 16, mem: 12_000_000_000, maxmem: 68_719_476_736, disk: 150_000_000_000, maxdisk: 1_000_000_000_000, uptime: 1209600, type: "node", id: "node/pve-2", level: "c" },
];

const QEMU_FIXTURE: PveRawQemu[] = [
  { vmid: 100, name: "ubuntu-server", status: "running", cpu: 0.05, cpus: 4, mem: 4_294_967_296, maxmem: 8_589_934_592, disk: 0, maxdisk: 100_000_000_000, uptime: 86400 },
  { vmid: 101, name: "nextcloud-vm", status: "stopped", cpu: 0, cpus: 2, mem: 0, maxmem: 4_294_967_296, disk: 0, maxdisk: 50_000_000_000, uptime: 0 },
];

const LXC_FIXTURE: PveRawLxc[] = [
  { vmid: 200, name: "nginx-ct", status: "running", cpu: 0.01, cpus: 2, mem: 536_870_912, maxmem: 1_073_741_824, disk: 10_000_000_000, maxdisk: 30_000_000_000, uptime: 172800 },
];

const STORAGE_FIXTURE: PveRawStorage[] = [
  { storage: "local", type: "dir", total: 500_000_000_000, used: 300_000_000_000, avail: 200_000_000_000, active: 1, enabled: 1 },
  { storage: "ceph-pool", type: "rbd", total: 10_000_000_000_000, used: 6_000_000_000_000, avail: 4_000_000_000_000, active: 1, enabled: 1 },
];

// ── Tests ──────────────────────────────────────────────────────────────────

test("getNodes unwraps { data: ... } envelope", async () => {
  enqueueResponse(200, NODE_FIXTURE);
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const nodes = await client.getNodes();
  expect(nodes).toHaveLength(2);
  expect(nodes[0].node).toBe("pve-1");
});

test("getNodeQemu returns VMs for a node", async () => {
  enqueueResponse(200, QEMU_FIXTURE);
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const vms = await client.getNodeQemu("pve-1");
  expect(vms).toHaveLength(2);
  expect(vms[0].name).toBe("ubuntu-server");
  expect(vms[0].status).toBe("running");
});

test("getNodeLxc returns containers", async () => {
  enqueueResponse(200, LXC_FIXTURE);
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const cts = await client.getNodeLxc("pve-1");
  expect(cts).toHaveLength(1);
  expect(cts[0].name).toBe("nginx-ct");
});

test("getNodeStorage returns storage pools", async () => {
  enqueueResponse(200, STORAGE_FIXTURE);
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const storage = await client.getNodeStorage("pve-1");
  expect(storage).toHaveLength(2);
  expect(storage[0].storage).toBe("local");
});

test("sends correct Authorization header", async () => {
  let capturedOptions: RequestOptions = {};
  mockHttpsRequest.mockImplementationOnce((options: RequestOptions, callback: RequestCallback) => {
    capturedOptions = options;
    const json = JSON.stringify({ data: [] });
    const chunks = [Buffer.from(json, "utf-8")];
    const res = {
      statusCode: 200,
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === "data") { for (const c of chunks) handler(c); }
        if (event === "end") handler();
      },
    };
    callback(res);
    return { on: () => {}, end: () => {} };
  });
  const client = new ProxmoxClient("https://pve.local:8006", "root@pam!monitor=abc123");
  await client.getNodes();
  const headers = capturedOptions.headers as Record<string, string>;
  expect(headers?.["Authorization"]).toBe("PVEAPIToken=root@pam!monitor=abc123");
});

test("throws on non-2xx status", async () => {
  enqueueResponse(401, {});
  const client = new ProxmoxClient("https://pve.local:8006", "bad-token");
  await expect(client.getNodes()).rejects.toThrow(/401/);
});

test("passes rejectUnauthorized=false when verifyTls=false", async () => {
  let capturedOptions: RequestOptions = {};
  mockHttpsRequest.mockImplementationOnce((options: RequestOptions, callback: RequestCallback) => {
    capturedOptions = options;
    const json = JSON.stringify({ data: [] });
    const chunks = [Buffer.from(json, "utf-8")];
    const res = {
      statusCode: 200,
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === "data") { for (const c of chunks) handler(c); }
        if (event === "end") handler();
      },
    };
    callback(res);
    return { on: () => {}, end: () => {} };
  });
  const client = new ProxmoxClient("https://pve.local:8006", "tok", false);
  await client.getNodes();
  expect(capturedOptions.rejectUnauthorized).toBe(false);
});

test("getSnapshot aggregates nodes + VMs + LXC + storage", async () => {
  // 7 calls: /nodes, then (qemu+lxc+storage) × 2 nodes
  enqueueSequence(
    { status: 200, body: NODE_FIXTURE },
    { status: 200, body: QEMU_FIXTURE },
    { status: 200, body: LXC_FIXTURE },
    { status: 200, body: STORAGE_FIXTURE },
    { status: 200, body: [] },
    { status: 200, body: [] },
    { status: 200, body: [{ storage: "local-zfs", type: "zfspool", total: 2_000_000_000_000, used: 800_000_000_000, avail: 1_200_000_000_000, active: 1, enabled: 1 }] },
  );
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const snap = await client.getSnapshot();

  expect(snap.online).toBe(true);
  expect(snap.nodes).toHaveLength(2);
  expect(snap.nodes[0].node).toBe("pve-1");
  expect(snap.nodes[0].vms).toHaveLength(2);
  expect(snap.nodes[0].containers).toHaveLength(1);
  expect(snap.nodes[0].storage).toHaveLength(2);

  expect(snap.nodes[1].node).toBe("pve-2");
  expect(snap.nodes[1].vms).toHaveLength(0);
  expect(snap.nodes[1].containers).toHaveLength(0);
  expect(snap.nodes[1].storage).toHaveLength(1);
});

test("getSnapshot handles offline node gracefully", async () => {
  const offlineNodes: PveRawNode[] = [
    { node: "pve-offline", status: "offline", cpu: 0, maxcpu: 0, mem: 0, maxmem: 0, disk: 0, maxdisk: 0, uptime: 0, type: "node", id: "node/pve-offline" },
  ];
  enqueueResponse(200, offlineNodes);
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const snap = await client.getSnapshot();
  expect(snap.nodes).toHaveLength(1);
  expect(snap.nodes[0].status).toBe("offline");
  expect(snap.nodes[0].vms).toHaveLength(0);
  expect(snap.nodes[0].containers).toHaveLength(0);
  expect(snap.nodes[0].storage).toHaveLength(0);
});

test("getSnapshot recovers from per-node qemu failure", async () => {
  enqueueSequence(
    { status: 200, body: NODE_FIXTURE.slice(0, 1) },
    { status: 500, body: {} },
    { status: 200, body: LXC_FIXTURE },
    { status: 200, body: STORAGE_FIXTURE },
  );
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const snap = await client.getSnapshot();
  expect(snap.nodes).toHaveLength(1);
  expect(snap.nodes[0].vms).toHaveLength(0); // graceful fallback
  expect(snap.nodes[0].containers).toHaveLength(1);
});

test("uses correct URL", async () => {
  let capturedOptions: RequestOptions = {};
  mockHttpsRequest.mockImplementationOnce((options: RequestOptions, callback: RequestCallback) => {
    capturedOptions = options;
    const json = JSON.stringify({ data: [] });
    const chunks = [Buffer.from(json, "utf-8")];
    const res = {
      statusCode: 200,
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === "data") { for (const c of chunks) handler(c); }
        if (event === "end") handler();
      },
    };
    callback(res);
    return { on: () => {}, end: () => {} };
  });
  const client = new ProxmoxClient("https://192.168.1.10:8006/", "tok");
  await client.getNodes();
  expect(capturedOptions.hostname).toBe("192.168.1.10");
  expect(capturedOptions.port).toBe("8006");
  expect(capturedOptions.path).toBe("/api2/json/nodes");
});
