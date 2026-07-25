/**
 * Proxmox client unit tests — mock node:https.request to verify the
 * /cluster/resources call, envelope unwrap, resource grouping, and
 * error handling.
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

import { ProxmoxClient, type PveRawResource } from "./proxmox";

// ── Helpers ────────────────────────────────────────────────────────────────

function enqueueResponse(statusCode: number, body: unknown) {
  const json = JSON.stringify({ data: body });
  mockHttpsRequest.mockImplementationOnce((_opts: RequestOptions, callback: RequestCallback) => {
    const chunks = [Buffer.from(json, "utf-8")];
    const res = {
      statusCode,
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === "data") for (const c of chunks) handler(c);
        if (event === "end") handler();
      },
    };
    callback(res);
    return { on: () => {}, end: () => {} };
  });
}

afterEach(() => {
  mockHttpsRequest.mockClear();
});

// ── Fixtures ───────────────────────────────────────────────────────────────

const TWO_NODE_CLUSTER: PveRawResource[] = [
  // Node 1
  { type: "node", id: "node/pve-1", node: "pve-1", status: "online", cpu: 0.15, maxcpu: 8, mem: 8_589_934_592, maxmem: 34_359_738_368, disk: 200_000_000_000, maxdisk: 500_000_000_000, uptime: 604800 },
  { type: "qemu", id: "qemu/100", node: "pve-1", vmid: 100, name: "ubuntu-server", status: "running", cpu: 0.05, cpus: 4, mem: 4_294_967_296, maxmem: 8_589_934_592, disk: 30_000_000_000, maxdisk: 100_000_000_000, uptime: 86400 },
  { type: "qemu", id: "qemu/101", node: "pve-1", vmid: 101, name: "nextcloud-vm", status: "stopped", cpu: 0, cpus: 2, mem: 0, maxmem: 4_294_967_296, disk: 20_000_000_000, maxdisk: 50_000_000_000, uptime: 0 },
  { type: "lxc", id: "lxc/200", node: "pve-1", vmid: 200, name: "nginx-ct", status: "running", cpu: 0.01, cpus: 2, mem: 536_870_912, maxmem: 1_073_741_824, disk: 10_000_000_000, maxdisk: 30_000_000_000, uptime: 172800 },
  { type: "storage", id: "storage/pve-1/local", node: "pve-1", storage: "local", plugin_type: "dir", total: 500_000_000_000, used: 300_000_000_000, avail: 200_000_000_000 },
  { type: "storage", id: "storage/pve-1/ceph", node: "pve-1", storage: "ceph-pool", plugin_type: "rbd", total: 10_000_000_000_000, used: 6_000_000_000_000, avail: 4_000_000_000_000 },
  // Node 2
  { type: "node", id: "node/pve-2", node: "pve-2", status: "online", cpu: 0.08, maxcpu: 16, mem: 12_000_000_000, maxmem: 68_719_476_736, disk: 150_000_000_000, maxdisk: 1_000_000_000_000, uptime: 1209600 },
  { type: "lxc", id: "lxc/201", node: "pve-2", vmid: 201, name: "db-ct", status: "running", cpu: 0.02, cpus: 4, mem: 2_000_000_000, maxmem: 4_000_000_000, disk: 50_000_000_000, maxdisk: 100_000_000_000, uptime: 3600 },
  { type: "storage", id: "storage/pve-2/zfs", node: "pve-2", storage: "zfs-pool", plugin_type: "zfspool", total: 2_000_000_000_000, used: 800_000_000_000, avail: 1_200_000_000_000 },
];

const SINGLE_NODE: PveRawResource[] = [
  { type: "node", id: "node/pve-1", node: "pve-1", status: "online", cpu: 0.1, maxcpu: 4, mem: 4_000_000_000, maxmem: 16_000_000_000, disk: 100_000_000_000, maxdisk: 500_000_000_000, uptime: 86400 },
];

const OFFLINE_NODE: PveRawResource[] = [
  { type: "node", id: "node/pve-offline", node: "pve-offline", status: "offline", cpu: 0, maxcpu: 0, mem: 0, maxmem: 0, disk: 0, maxdisk: 0, uptime: 0 },
];

// ── Tests ──────────────────────────────────────────────────────────────────

test("getSnapshot groups resources by node across a 2-node cluster", async () => {
  enqueueResponse(200, TWO_NODE_CLUSTER);
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const snap = await client.getSnapshot();

  expect(snap.online).toBe(true);
  expect(snap.nodes).toHaveLength(2);

  // Node 1
  const n1 = snap.nodes.find((n) => n.node === "pve-1")!;
  expect(n1).toBeDefined();
  expect(n1.status).toBe("online");
  expect(n1.cpu).toBe(0.15);
  expect(n1.vms).toHaveLength(2);
  expect(n1.vms[0].name).toBe("ubuntu-server");
  expect(n1.vms[0].status).toBe("running");
  expect(n1.vms[0].mem).toBe(4_294_967_296);
  expect(n1.containers).toHaveLength(1);
  expect(n1.containers[0].name).toBe("nginx-ct");
  expect(n1.storage).toHaveLength(2);
  expect(n1.storage.map((s) => s.storage)).toEqual(["local", "ceph-pool"]);

  // Node 2
  const n2 = snap.nodes.find((n) => n.node === "pve-2")!;
  expect(n2).toBeDefined();
  expect(n2.vms).toHaveLength(0);
  expect(n2.containers).toHaveLength(1);
  expect(n2.containers[0].name).toBe("db-ct");
  expect(n2.storage).toHaveLength(1);
  expect(n2.storage[0].storage).toBe("zfs-pool");
});

test("getSnapshot sends correct Authorization header", async () => {
  let capturedOptions: RequestOptions = {};
  mockHttpsRequest.mockImplementationOnce((options: RequestOptions, callback: RequestCallback) => {
    capturedOptions = options;
    const json = JSON.stringify({ data: SINGLE_NODE });
    const chunks = [Buffer.from(json, "utf-8")];
    const res = { statusCode: 200, on: (e: string, h: (...a: unknown[]) => void) => { if (e === "data") for (const c of chunks) h(c); if (e === "end") h(); } };
    callback(res);
    return { on: () => {}, end: () => {} };
  });
  const client = new ProxmoxClient("https://pve.local:8006", "root@pam!monitor=abc123");
  await client.getSnapshot();
  expect((capturedOptions.headers as Record<string, string>)?.["Authorization"]).toBe("PVEAPIToken=root@pam!monitor=abc123");
});

test("getSnapshot hits /cluster/resources", async () => {
  let capturedPath = "";
  mockHttpsRequest.mockImplementationOnce((options: RequestOptions, callback: RequestCallback) => {
    capturedPath = options.path as string;
    const json = JSON.stringify({ data: SINGLE_NODE });
    const chunks = [Buffer.from(json, "utf-8")];
    const res = { statusCode: 200, on: (e: string, h: (...a: unknown[]) => void) => { if (e === "data") for (const c of chunks) h(c); if (e === "end") h(); } };
    callback(res);
    return { on: () => {}, end: () => {} };
  });
  const client = new ProxmoxClient("https://pve.local:8006", "tok");
  await client.getSnapshot();
  expect(capturedPath).toBe("/api2/json/cluster/resources");
});

test("throws on non-2xx status", async () => {
  mockHttpsRequest.mockImplementationOnce((_opts: RequestOptions, callback: RequestCallback) => {
    const res = { statusCode: 401, on: (e: string, h: (...a: unknown[]) => void) => { if (e === "end") h(); } };
    callback(res);
    return { on: () => {}, end: () => {} };
  });
  const client = new ProxmoxClient("https://pve.local:8006", "bad-token");
  await expect(client.getSnapshot()).rejects.toThrow(/401/);
});

test("passes rejectUnauthorized=false when verifyTls=false", async () => {
  let capturedOptions: RequestOptions = {};
  mockHttpsRequest.mockImplementationOnce((options: RequestOptions, callback: RequestCallback) => {
    capturedOptions = options;
    const json = JSON.stringify({ data: SINGLE_NODE });
    const chunks = [Buffer.from(json, "utf-8")];
    const res = { statusCode: 200, on: (e: string, h: (...a: unknown[]) => void) => { if (e === "data") for (const c of chunks) h(c); if (e === "end") h(); } };
    callback(res);
    return { on: () => {}, end: () => {} };
  });
  const client = new ProxmoxClient("https://pve.local:8006", "tok", false);
  await client.getSnapshot();
  expect(capturedOptions.rejectUnauthorized).toBe(false);
});

test("handles offline node gracefully", async () => {
  enqueueResponse(200, OFFLINE_NODE);
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const snap = await client.getSnapshot();
  expect(snap.nodes).toHaveLength(1);
  expect(snap.nodes[0].status).toBe("offline");
  expect(snap.nodes[0].vms).toHaveLength(0);
  expect(snap.nodes[0].containers).toHaveLength(0);
  expect(snap.nodes[0].storage).toHaveLength(0);
});

test("handles empty cluster (no resources)", async () => {
  enqueueResponse(200, []);
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const snap = await client.getSnapshot();
  expect(snap.nodes).toHaveLength(0);
});

test("handles resources without a node owner (orphan guests)", async () => {
  const orphan: PveRawResource[] = [
    { type: "qemu", id: "qemu/99", vmid: 99, name: "orphan-vm", status: "running", cpu: 0.1, cpus: 2, mem: 1_000_000_000, maxmem: 2_000_000_000, disk: 0, maxdisk: 10_000_000_000, uptime: 100 },
  ];
  enqueueResponse(200, orphan);
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const snap = await client.getSnapshot();
  // orphan guests create a synthetic node
  expect(snap.nodes).toHaveLength(1);
  expect(snap.nodes[0].vms).toHaveLength(1);
  expect(snap.nodes[0].vms[0].name).toBe("orphan-vm");
});

test("uses correct URL with base path handling", async () => {
  let calledHostname = "";
  let calledPort = "";
  mockHttpsRequest.mockImplementationOnce((options: RequestOptions, callback: RequestCallback) => {
    calledHostname = options.hostname as string;
    calledPort = options.port as string;
    const json = JSON.stringify({ data: [] });
    const chunks = [Buffer.from(json, "utf-8")];
    const res = { statusCode: 200, on: (e: string, h: (...a: unknown[]) => void) => { if (e === "data") for (const c of chunks) h(c); if (e === "end") h(); } };
    callback(res);
    return { on: () => {}, end: () => {} };
  });
  const client = new ProxmoxClient("https://192.168.1.10:8006/", "tok");
  await client.getSnapshot();
  expect(calledHostname).toBe("192.168.1.10");
  expect(calledPort).toBe("8006");
});

test("vm and lxc cpus field is populated", async () => {
  enqueueResponse(200, TWO_NODE_CLUSTER);
  const client = new ProxmoxClient("https://pve.local:8006", "token");
  const snap = await client.getSnapshot();
  const vm = snap.nodes[0].vms[0];
  expect(vm.cpus).toBe(4);
  const ct = snap.nodes[0].containers[0];
  expect(ct.cpus).toBe(2);
});
