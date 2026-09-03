import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const snapshot = { alertCount: 0, config: {}, maintenance: [] };
const getSnapshot = mock(async () => snapshot);
const saveConfig = mock(async () => ({}));
const refresh = mock(async () => {});
const acknowledge = mock(async () => {});
const acknowledgeAll = mock(async () => {});
const addMaintenance = mock(async () => ({}));
const deleteMaintenance = mock(async () => {});

let route: typeof import("./route");

beforeAll(async () => {
  mock.module("@/lib/operations", () => ({
    getOperationsSnapshot: getSnapshot,
    saveOperationsConfig: saveConfig,
    refreshOperationsChecks: refresh,
    acknowledgeRelease: acknowledge,
    acknowledgeAllReleases: acknowledgeAll,
    addMaintenanceWindow: addMaintenance,
    deleteMaintenanceWindow: deleteMaintenance,
  }));
  route = await import(`./route.ts?bust=${Date.now()}-${Math.random()}`);
});

beforeEach(() => {
  for (const fn of [getSnapshot, saveConfig, refresh, acknowledge, acknowledgeAll, addMaintenance, deleteMaintenance]) fn.mockClear();
});

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/operations", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("operations route", () => {
  test("GET supports an explicit live refresh", async () => {
    const response = await route.GET(new Request("http://localhost/api/operations?refresh=1"));
    expect(response.status).toBe(200);
    expect(getSnapshot).toHaveBeenCalledWith(true);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("PUT validates integration URLs", async () => {
    const response = await route.PUT(jsonRequest("PUT", { adguardUrl: "javascript:bad" }));
    expect(response.status).toBe(400);
    expect(saveConfig).not.toHaveBeenCalled();
  });


  test("POST validates maintenance ordering in the domain", async () => {
    const response = await route.POST(jsonRequest("POST", {
      action: "add-maintenance",
      startsAt: "2026-08-23T12:00:00.000Z",
      endsAt: "2026-08-23T13:00:00.000Z",
      reason: "Upgrade",
      sources: ["deployments", "tls"],
    }));
    expect(response.status).toBe(200);
    expect(addMaintenance).toHaveBeenCalledWith(expect.objectContaining({ reason: "Upgrade", sources: ["deployments", "tls"] }));
  });
  test("POST acknowledges all releases", async () => {
    const response = await route.POST(jsonRequest("POST", { action: "ack-all-releases" }));
    expect(response.status).toBe(200);
    expect(acknowledgeAll).toHaveBeenCalledTimes(1);
  });


  test("POST rejects unknown actions", async () => {
    const response = await route.POST(jsonRequest("POST", { action: "destroy-everything" }));
    expect(response.status).toBe(400);
  });
});
