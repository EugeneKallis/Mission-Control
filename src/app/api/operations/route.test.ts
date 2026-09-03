import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const snapshot = { alertCount: 0, config: {} };
const getSnapshot = mock(async () => snapshot);
const saveConfig = mock(async () => ({}));
const refresh = mock(async () => {});
const acknowledge = mock(async () => {});
const acknowledgeAll = mock(async () => {});

let route: typeof import("./route");


beforeAll(async () => {
  mock.module("@/lib/operations", () => ({
    getOperationsSnapshot: getSnapshot,
    saveOperationsConfig: saveConfig,
    refreshOperationsChecks: refresh,
    acknowledgeRelease: acknowledge,
    acknowledgeAllReleases: acknowledgeAll,
  }));
  route = await import(`./route.ts?bust=${Date.now()}-${Math.random()}`);
});
beforeEach(() => {
  for (const fn of [getSnapshot, saveConfig, refresh, acknowledge, acknowledgeAll]) fn.mockClear();
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
