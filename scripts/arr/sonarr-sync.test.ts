/**
 * Integration test for sonarr-sync: orphan detection in Sonarr4K vs main Sonarr.
 *
 * Mocks resolveConfig from @/lib/config to return controlled Arr instances
 * (avoiding the real DB) and mocks fetch for Arr API calls.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { captureFetch, type CapturedCall } from "../_lib/test-fetch";

const realFetch = globalThis.fetch;

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restore();
});

async function loadScript() {
  mock.module("@/lib/config", () => ({
    resolveConfig: async () => ({
      arrInstances: [
        { type: "sonarr", name: "Sonarr", url: "http://127.0.0.1:8989", apiKey: "main-key" },
        { type: "sonarr", name: "Sonarr4K", url: "http://127.0.0.1:8990", apiKey: "4k-key" },
      ],
    }),
  }));
  const stamp = Date.now() + Math.random();
  return (await import(`./sonarr-sync?bust=${stamp}`)) as typeof import("./sonarr-sync");
}

describe("sonarr-sync", () => {
  test("dry-run flags orphans without issuing DELETEs", async () => {
    const recent: { url: string } = { url: "" };
    const calls = captureFetch(
      {
        "GET /api/v3/series": () => {
          if (recent.url.includes(":8989")) {
            return [
              { id: 1, title: "In both", tvdbId: 100, path: "/tv/in-both", titleSlug: "in-both" },
            ];
          }
          return [
            { id: 10, title: "In both (4K)", tvdbId: 100, path: "/tv4k/in-both", titleSlug: "in-both-4k" },
            { id: 11, title: "4K-only orphan", tvdbId: 999, path: "/tv4k/orphan", titleSlug: "orphan" },
          ];
        },
        "DELETE /api/v3/series/": () => ({}),
      },
      { onCall: (c: CapturedCall) => { recent.url = c.url; } },
    );

    const script = await loadScript();
    await script.main([]); // dry-run is the new default

    const deletes = calls.filter((c) => c.method === "DELETE");
    expect(deletes.length).toBe(0);
  });

  test("LIVE mode (--run) issues DELETE for each orphan with deleteFiles=true", async () => {
    const recent: { url: string } = { url: "" };
    const calls = captureFetch(
      {
        "GET /api/v3/series": () => {
          if (recent.url.includes(":8989")) {
            return [{ id: 1, title: "Main", tvdbId: 100, path: "/tv/main", titleSlug: "main" }];
          }
          return [
            { id: 10, title: "In both", tvdbId: 100, path: "/tv4k/in-both", titleSlug: "in-both" },
            { id: 11, title: "Orphan", tvdbId: 999, path: "/tv4k/orphan", titleSlug: "orphan" },
          ];
        },
        "DELETE /api/v3/series/": () => ({}),
      },
      { onCall: (c: CapturedCall) => { recent.url = c.url; } },
    );

    const script = await loadScript();
    await script.main(["--run"]);

    const deletes = calls.filter((c) => c.method === "DELETE");
    expect(deletes.length).toBe(1);
    expect(deletes[0].url).toContain("/series/11");
    expect(deletes[0].url).toContain("deleteFiles=true");
  });
});
