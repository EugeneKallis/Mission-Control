/**
 * Unit tests for /api/arr/instance-map (GET)
 *
 * The route is a one-liner that returns getArrInstanceMap(). We mock
 * @/lib/arr-map directly so the test is hermetic.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { jsonBody, status } from "@/test-utils/route-helpers";

let getArrInstanceMapMock: ReturnType<typeof mock>;

beforeEach(() => {
  getArrInstanceMapMock = mock(() => ({}));
  mock.module("@/lib/arr-map", () => ({
    getArrInstanceMap: getArrInstanceMapMock,
  }));
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("GET /api/arr/instance-map", () => {
  test("returns the map produced by getArrInstanceMap", async () => {
    getArrInstanceMapMock = mock(() => ({
      Radarr: "http://192.168.1.111:7878",
      Sonarr: "http://192.168.1.111:8989",
    }));
    mock.module("@/lib/arr-map", () => ({
      getArrInstanceMap: getArrInstanceMapMock,
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({
      Radarr: "http://192.168.1.111:7878",
      Sonarr: "http://192.168.1.111:8989",
    });
  });

  test("returns an empty object when there are no Arr instances", async () => {
    getArrInstanceMapMock = mock(() => ({}));
    mock.module("@/lib/arr-map", () => ({
      getArrInstanceMap: getArrInstanceMapMock,
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({});
  });

  test("returns 500 when getArrInstanceMap throws", async () => {
    getArrInstanceMapMock = mock(() => {
      throw new Error("config boom");
    });
    mock.module("@/lib/arr-map", () => ({
      getArrInstanceMap: getArrInstanceMapMock,
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to build arr instance map" });
  });
});
