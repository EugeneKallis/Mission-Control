/**
 * Unit tests for /api/arr/instance-map (GET)
 *
 * The route calls await resolveConfig().arrInstances. We mock
 * @/lib/config to return controlled test data.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { jsonBody, status } from "@/test-utils/route-helpers";

const DEFAULT_INSTANCES = [
  { type: "radarr", name: "Radarr", url: "http://192.168.1.111:7878", apiKey: "" },
  { type: "sonarr", name: "Sonarr", url: "http://192.168.1.111:8989", apiKey: "" },
];

function mockConfig(instances: typeof DEFAULT_INSTANCES) {
  mock.module("@/lib/config", () => ({
    resolveConfig: async () => ({
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
  test("returns the map produced by resolveConfig", async () => {
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

  test("returns 500 when resolveConfig throws", async () => {
    mock.module("@/lib/config", () => ({
      resolveConfig: async () => { throw new Error("config boom"); },
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to build arr instance map" });
  });

  test("DB-backed URLs appear in the instance map (env > DB > default precedence)", async () => {
    // Simulate DB-overridden URLs by mocking resolveConfig with different URLs.
    // In production, resolveConfig() merges env, DB, and defaults.
    // Here we test that the route correctly uses whatever resolveConfig returns.
    mock.module("@/lib/config", () => ({
      resolveConfig: async () => ({
        arrInstances: [
          { type: "radarr" as const, name: "Radarr", url: "http://db-override:7888", apiKey: "" },
          { type: "sonarr" as const, name: "Sonarr", url: "http://192.168.1.111:8989", apiKey: "" },
        ],
      }),
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = await jsonBody(res) as Record<string, string>;
    expect(body.Radarr).toBe("http://db-override:7888");
    expect(body.Sonarr).toBe("http://192.168.1.111:8989");
  });
});
