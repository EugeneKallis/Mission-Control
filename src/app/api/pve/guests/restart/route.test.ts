/** Tests for POST /api/pve/guests/restart. */

import { afterEach, beforeEach, expect, mock, test } from "bun:test";

const mockGetEndpoint = mock<(id: number) => any>();
const mockCreateMacro = mock<(data: any) => any>();
const mockGetSnapshot = mock<() => any>();

mock.module("@/lib/db/queries", () => ({
  getProxmoxEndpoint: mockGetEndpoint,
  createMacro: mockCreateMacro,
}));

mock.module("@/lib/clients/proxmox", () => ({
  ProxmoxClient: mock(() => ({ getSnapshot: mockGetSnapshot })),
}));

import { POST } from "./route";

const endpoint = {
  id: 1,
  name: "Main Cluster",
  apiUrl: "https://pve1:8006",
  apiToken: "token",
  verifyTls: false,
  enabled: true,
};

const runningSnapshot = {
  nodes: [{
    node: "pve-1",
    vms: [{ vmid: 100, name: "vm-one", status: "running" }],
    containers: [{ vmid: 200, name: "ct-one", status: "running" }],
  }],
};

function restartRequest(body: unknown): Request {
  return new Request("http://localhost/api/pve/guests/restart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetEndpoint.mockResolvedValue(endpoint);
  mockGetSnapshot.mockResolvedValue(runningSnapshot);
  mockCreateMacro.mockResolvedValue({ id: 77 });
});

afterEach(() => {
  mockGetEndpoint.mockClear();
  mockGetSnapshot.mockClear();
  mockCreateMacro.mockClear();
});

test("prepares a hidden VM restart macro only after a fresh running-state check", async () => {
  const res = await POST(restartRequest({ endpointId: 1, node: "pve-1", vmid: 100, type: "vm" }));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ macroId: 77 });
  expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
  expect(mockCreateMacro).toHaveBeenCalledWith({
    name: "Restart VM 100",
    description: "Prepared Proxmox VM restart on Main Cluster.",
    commands: JSON.stringify([{
      ord: 0,
      cmd: "bun run scripts/util/command-runner.ts --host root@pve-1 -- qm reboot 100",
    }]),
    isInternal: true,
  });
});

test("prepares the canonical LXC restart command", async () => {
  const res = await POST(restartRequest({ endpointId: 1, node: "pve-1", vmid: 200, type: "lxc" }));

  expect(res.status).toBe(200);
  const command = JSON.parse(mockCreateMacro.mock.calls[0][0].commands)[0].cmd;
  expect(command).toBe("bun run scripts/util/command-runner.ts --host root@pve-1 -- pct reboot 200");
});

test("rejects invalid request bodies before loading an endpoint or creating a macro", async () => {
  const res = await POST(restartRequest({ endpointId: 1, node: "pve-1", vmid: 100, type: "node", command: "qm reboot 100" }));

  expect(res.status).toBe(400);
  expect(mockGetEndpoint).not.toHaveBeenCalled();
  expect(mockCreateMacro).not.toHaveBeenCalled();
});

test("rejects missing and disabled endpoints without creating a macro", async () => {
  mockGetEndpoint.mockResolvedValueOnce(null);
  expect((await POST(restartRequest({ endpointId: 1, node: "pve-1", vmid: 100, type: "vm" }))).status).toBe(404);

  mockGetEndpoint.mockResolvedValueOnce({ ...endpoint, enabled: false });
  expect((await POST(restartRequest({ endpointId: 1, node: "pve-1", vmid: 100, type: "vm" }))).status).toBe(409);


  expect(mockCreateMacro).not.toHaveBeenCalled();
  expect(mockGetSnapshot).not.toHaveBeenCalled();
});

test("rejects stopped, absent, or unsafe-node guests from the fresh endpoint snapshot", async () => {
  mockGetSnapshot.mockResolvedValueOnce({
    nodes: [{ ...runningSnapshot.nodes[0], vms: [{ vmid: 100, name: "vm-one", status: "stopped" }] }],
  });
  expect((await POST(restartRequest({ endpointId: 1, node: "pve-1", vmid: 100, type: "vm" }))).status).toBe(409);

  mockGetSnapshot.mockResolvedValueOnce({ nodes: [{ ...runningSnapshot.nodes[0], containers: [] }] });
  expect((await POST(restartRequest({ endpointId: 1, node: "pve-1", vmid: 999, type: "lxc" }))).status).toBe(409);

  // The request value is only a lookup key; even a matching node returned by
  // Proxmox must pass hostname validation before command construction.
  mockGetSnapshot.mockResolvedValueOnce({
    nodes: [{ ...runningSnapshot.nodes[0], node: "pve-1;evil" }],
  });
  expect((await POST(restartRequest({ endpointId: 1, node: "pve-1;evil", vmid: 100, type: "vm" }))).status).toBe(409);

  expect(mockCreateMacro).not.toHaveBeenCalled();
});
