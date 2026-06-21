/**
 * Unit tests for src/lib/arr-map.ts
 *
 * getArrInstanceMap() calls getConfig() and reads arrInstances. We
 * exercise both the happy path and the case where getConfig() throws
 * (e.g. during a build without env vars set).
 */

import { describe, test, expect, mock } from "bun:test";

describe("getArrInstanceMap", () => {
  test("returns name → url map for every configured instance", async () => {
    // Reset the module-level cache by re-importing after a mock.
    mock.module("@/lib/config", () => ({
      getConfig: () => ({
        arrInstances: [
          { type: "radarr", name: "Radarr", url: "http://r", apiKey: "" },
          { type: "sonarr", name: "Sonarr", url: "http://s", apiKey: "" },
          { type: "sonarr", name: "", url: "http://orphan", apiKey: "" }, // skipped
          { type: "sonarr", name: "NoUrl", url: "", apiKey: "" }, // skipped
        ],
      }),
    }));

    // Re-import with a query suffix to dodge the module cache. Cast to
    // the module type since the wildcard module declaration in
    // test-modules.d.ts makes the cache-busting import `any`.
    const { getArrInstanceMap } = (await import("./arr-map?fresh")) as typeof import("./arr-map");
    const map = getArrInstanceMap();
    expect(map).toEqual({
      Radarr: "http://r",
      Sonarr: "http://s",
    });
  });

  test("returns an empty map when getConfig throws", async () => {
    mock.module("@/lib/config", () => ({
      getConfig: () => {
        throw new Error("env not set");
      },
    }));

    const { getArrInstanceMap } = (await import("./arr-map?fresh2")) as typeof import("./arr-map");
    expect(getArrInstanceMap()).toEqual({});
  });
});
