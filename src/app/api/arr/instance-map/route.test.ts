/**
 * Unit tests for /api/arr/instance-map (GET)
 *
 * The route calls getConfig().arrInstances. We mock @/lib/config
 * to return controlled test data.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { jsonBody, status } from "@/test-utils/route-helpers";

const DEFAULT_INSTANCES = [
  { type: "radarr", name: "Radarr", url: "http://192.168.1.111:7878", apiKey: "" },
  { type: "sonarr", name: "Sonarr", url: "http://192.168.1.111:8989", apiKey: "" },
];

function mockConfig(instances: typeof DEFAULT_INSTANCES) {
  mock.module("@/lib/config", () => ({
    getConfig: () => ({
      arrInstances: instances,
    }),
  }));
}

beforeEach(() => {
  mockConfig(DEFAULT_INSTANCES);
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("GET /api/arr/instance-map", () => {
  test("returns the map produced by getConfig", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({
      Radarr: "http://192.168.1.111:7878",
      Sonarr: "http://192.168.1.111:8989",
    });
  });

  test("returns an empty object when there are no Arr instances", async () => {
    mockConfig([]);

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({});
  });

  test("returns 500 when getConfig throws", async () => {
    mock.module("@/lib/config", () => ({
      getConfig: () => { throw new Error("config boom"); },
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to build arr instance map" });
  });
});
