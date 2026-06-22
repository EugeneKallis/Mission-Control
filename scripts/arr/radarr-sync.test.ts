/**
 * Integration test for radarr-sync: orphan detection in Radarr4K vs main Radarr.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { captureFetch, type CapturedCall } from "../_lib/test-fetch";

const realFetch = globalThis.fetch;

beforeEach(() => {
  mock.restore();
  process.env.ARR__RADARR__API_KEY = "main-key";
  process.env.ARR__RADARR4K__API_KEY = "4k-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restore();
});

async function loadScript() {
  // Re-install a working @/lib/config mock in case arr-map's
  // throwing mock leaked in from a previous test file.
  mock.module("@/lib/config", () => ({
    getConfig: () => ({
      arrInstances: [
        { type: "radarr", name: "Radarr", url: "http://127.0.0.1:7878", apiKey: "main-key" },
        { type: "radarr", name: "Radarr4K", url: "http://127.0.0.1:7879", apiKey: "4k-key" },
      ],
    }),
  }));
  const stamp = Date.now() + Math.random();
  return (await import(`./radarr-sync?bust=${stamp}`)) as typeof import("./radarr-sync");
}

describe("radarr-sync", () => {
  test("dry-run flags orphans without issuing DELETEs", async () => {
    const recent: { url: string } = { url: "" };
    const calls = captureFetch(
      {
        "GET /api/v3/movie": () => {
          if (recent.url.includes(":7878")) {
            return [
              { id: 1, title: "In both", tmdbId: 100, hasFile: true, monitored: true, status: "released", titleSlug: "in-both" },
              { id: 2, title: "Main only", tmdbId: 200, hasFile: true, monitored: true, status: "released", titleSlug: "main-only" },
            ];
          }
          return [
            { id: 10, title: "In both (4K)", tmdbId: 100, hasFile: true, monitored: true, status: "released", titleSlug: "in-both-4k" },
            { id: 11, title: "4K-only orphan", tmdbId: 999, hasFile: true, monitored: true, status: "released", titleSlug: "orphan" },
            { id: 12, title: "Null TMDB", tmdbId: undefined, hasFile: true, monitored: true, status: "released", titleSlug: "null-tmdb" },
          ];
        },
        "DELETE /api/v3/movie/": () => ({}),
      },
      { onCall: (c: CapturedCall) => { recent.url = c.url; } },
    );

    const script = await loadScript();
    await script.main([]); // dry-run is the new default

    const deletes = calls.filter((c) => c.method === "DELETE");
    // dry-run must not call DELETE.
    expect(deletes.length).toBe(0);
  });

  test("LIVE mode (--no-dry-run) issues DELETE for each orphan with deleteFiles=true", async () => {
    const recent: { url: string } = { url: "" };
    const calls = captureFetch(
      {
        "GET /api/v3/movie": () => {
          if (recent.url.includes(":7878")) {
            return [{ id: 1, title: "Main", tmdbId: 100, hasFile: true, monitored: true, status: "released", titleSlug: "main" }];
          }
          return [
            { id: 10, title: "In both", tmdbId: 100, hasFile: true, monitored: true, status: "released", titleSlug: "in-both" },
            { id: 11, title: "Orphan", tmdbId: 999, hasFile: true, monitored: true, status: "released", titleSlug: "orphan" },
          ];
        },
        // Prefix match: matches DELETE /api/v3/movie/11?deleteFiles=true
        "DELETE /api/v3/movie/": () => ({}),
      },
      { onCall: (c: CapturedCall) => { recent.url = c.url; } },
    );

    const script = await loadScript();
    await script.main(["--no-dry-run"]);

    const deletes = calls.filter((c) => c.method === "DELETE");
    // Exactly one DELETE for the orphan (id=11), with deleteFiles=true.
    expect(deletes.length).toBe(1);
    expect(deletes[0].url).toContain("/movie/11");
    expect(deletes[0].url).toContain("deleteFiles=true");
  });
});
