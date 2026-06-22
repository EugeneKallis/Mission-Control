/**
 * Integration test for the Arr searcher.
 *
 * We mock fetch (the only network surface the script uses) and import the
 * script with a cache-bust query so the AppConfig singleton is re-evaluated
 * with the env vars we set in the test.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { captureFetch } from "../_lib/test-fetch";

const realFetch = globalThis.fetch;

beforeEach(() => {
  mock.restore();
  // Set env for the AppConfig singleton (consumed on first getConfig() call).
  process.env.ARR__RADARR__API_KEY = "radarr-key";
  process.env.ARR__RADARRKIDS__API_KEY = "radarrkids-key";
  process.env.ARR__RADARR4K__API_KEY = "radarr4k-key";
  process.env.ARR__SONARR__API_KEY = "sonarr-key";
  process.env.ARR__SONARRKIDS__API_KEY = "sonarrkids-key";
  process.env.ARR__SONARR4K__API_KEY = "sonarr4k-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restore();
});

async function loadScript() {
  // The arr-map.test.ts file leaks a @/lib/config mock that throws on
  // getConfig(). We re-install a real-looking one before each import so
  // our test doesn't pick up the leak.
  mock.module("@/lib/config", () => ({
    getConfig: () => ({
      arrInstances: [
        { type: "radarr", name: "Radarr", url: "http://127.0.0.1:7878", apiKey: "radarr-key" },
        { type: "radarr", name: "RadarrKids", url: "http://127.0.0.1:7880", apiKey: "radarrkids-key" },
        { type: "radarr", name: "Radarr4K", url: "http://127.0.0.1:7879", apiKey: "radarr4k-key" },
        { type: "radarr", name: "RadarrAnime", url: "http://127.0.0.1:7881", apiKey: "" },
        { type: "radarr", name: "RadarrLocal", url: "http://127.0.0.1:7882", apiKey: "" },
        { type: "sonarr", name: "Sonarr", url: "http://127.0.0.1:8989", apiKey: "sonarr-key" },
        { type: "sonarr", name: "SonarrKids", url: "http://127.0.0.1:8991", apiKey: "sonarrkids-key" },
        { type: "sonarr", name: "Sonarr4K", url: "http://127.0.0.1:8990", apiKey: "sonarr4k-key" },
      ],
    }),
  }));
  const stamp = Date.now() + Math.random();
  return (await import(`./arr-searcher?bust=${stamp}`)) as typeof import("./arr-searcher");
}

describe("arr-searcher", () => {
  test("queries Radarr instances in priority order: Radarr → RadarrKids → Radarr4K", async () => {
    const calls = captureFetch({
      "GET /api/v3/movie": () => [
        { id: 1, title: "Real Missing", status: "released", hasFile: false, monitored: true, titleSlug: "a" },
      ],
      "POST /api/v3/command": () => ({ status: "ok" }),
    });

    const script = await loadScript();
    await script.main(["--radarr-only", "--limit", "50"]);

    // The fixture uses ports 7878 (Radarr), 7880 (RadarrKids), 7879 (Radarr4K).
    // We assert the order in which the script visited each instance.
    const ports = calls
      .filter((c) => c.method === "GET" && c.url.endsWith("/api/v3/movie"))
      .map((c) => Number(new URL(c.url).port));
    expect(ports).toEqual([7878, 7880, 7879]);
  });

  test("missing-movie filter excludes announced / hasFile / unmonitored", async () => {
    const calls = captureFetch({
      "GET /api/v3/movie": () => [
        { id: 1, title: "Announced", status: "announced", hasFile: false, monitored: true, titleSlug: "a" },
        { id: 2, title: "HasFile", status: "released", hasFile: true, monitored: true, titleSlug: "b" },
        { id: 3, title: "Unmonitored", status: "released", hasFile: false, monitored: false, titleSlug: "c" },
        { id: 4, title: "Real Missing", status: "released", hasFile: false, monitored: true, titleSlug: "d" },
      ],
      "POST /api/v3/command": () => ({ status: "ok" }),
    });

    const script = await loadScript();
    await script.main(["--radarr-only", "--limit", "50"]);

    const triggeredIds = calls
      .filter((c) => c.url.endsWith("/api/v3/command"))
      .map((c) => (c.body as { movieIds: number[] }).movieIds)
      .flat();
    // Each of the 3 Radarr instances should narrow down to id=4 only.
    expect(triggeredIds).toEqual([4, 4, 4]);
  });

  test("--limit caps the number of trigger calls per instance", async () => {
    const calls = captureFetch({
      "GET /api/v3/movie": () =>
        Array.from({ length: 20 }, (_, i) => ({
          id: i + 1,
          title: `Missing ${i}`,
          status: "released",
          hasFile: false,
          monitored: true,
          titleSlug: `t${i}`,
        })),
      "POST /api/v3/command": () => ({ status: "ok" }),
    });

    const script = await loadScript();
    await script.main(["--radarr-only", "--limit", "3"]);

    // 3 instances × 3 triggers = 9.
    const triggers = calls.filter((c) => c.url.endsWith("/api/v3/command"));
    expect(triggers.length).toBe(9);
  });

  test("--dry-run logs without issuing command POSTs", async () => {
    const calls = captureFetch({
      "GET /api/v3/movie": () => [
        { id: 1, title: "Real Missing", status: "released", hasFile: false, monitored: true, titleSlug: "a" },
      ],
    });

    const script = await loadScript();
    await script.main(["--radarr-only", "--dry-run"]);

    expect(calls.some((c) => c.url.endsWith("/api/v3/command"))).toBe(false);
  });
});
