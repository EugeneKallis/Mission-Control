/**
 * Integration test for the Arr searcher.
 *
 * We mock fetch (the only network surface the script uses), mock
 * resolveConfig from @/lib/config to return controlled Arr instances
 * (avoiding the real DB), and import the script with a cache-bust query.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { captureFetch } from "../_lib/test-fetch";

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
        { type: "radarr", name: "Radarr", url: "http://127.0.0.1:7878", apiKey: "radarr-key" },
        { type: "radarr", name: "RadarrKids", url: "http://127.0.0.1:7880", apiKey: "radarrkids-key" },
        { type: "radarr", name: "Radarr4K", url: "http://127.0.0.1:7879", apiKey: "radarr4k-key" },
        { type: "radarr", name: "RadarrAnime", url: "http://127.0.0.1:7881", apiKey: "radarranime-key" },
        { type: "radarr", name: "RadarrLocal", url: "http://127.0.0.1:7882", apiKey: "" },
        { type: "sonarr", name: "Sonarr", url: "http://127.0.0.1:8989", apiKey: "sonarr-key" },
        { type: "sonarr", name: "SonarrKids", url: "http://127.0.0.1:8991", apiKey: "sonarrkids-key" },
        { type: "sonarr", name: "Sonarr4K", url: "http://127.0.0.1:8990", apiKey: "sonarr4k-key" },
        { type: "sonarr", name: "SonarrAnime", url: "http://127.0.0.1:8992", apiKey: "sonarranime-key" },
      ],
    }),
  }));
  const stamp = Date.now() + Math.random();
  return (await import(`./arr-searcher?bust=${stamp}`)) as typeof import("./arr-searcher");
}

describe("arr-searcher", () => {
  test("queries Radarr instances in priority order: Radarr → RadarrKids → Radarr4K → RadarrAnime", async () => {
    const calls = captureFetch({
      "GET /api/v3/queue": () => ({ records: [], totalRecords: 0 }),
      "GET /api/v3/movie": () => [
        { id: 1, title: "Real Missing", status: "released", hasFile: false, monitored: true, titleSlug: "a" },
      ],
      "POST /api/v3/command": () => ({ status: "ok" }),
    });

    const script = await loadScript();
    await script.main(["--radarr-only", "--limit", "50", "--run"]);

    // The fixture uses ports 7878 (Radarr), 7880 (RadarrKids), 7879 (Radarr4K), 7881 (RadarrAnime).
    // We assert the order in which the script visited each instance.
    const ports = calls
      .filter((c) => c.method === "GET" && c.url.endsWith("/api/v3/movie"))
      .map((c) => Number(new URL(c.url).port));
    expect(ports).toEqual([7878, 7880, 7879, 7881]);
  });

  test("queries Anime instances", async () => {
    const calls = captureFetch({
      "GET /api/v3/queue": () => ({ records: [], totalRecords: 0 }),
      "GET /api/v3/movie": () => [],
      "GET /api/v3/wanted/missing": () => ({ records: [], totalRecords: 0 }),
    });

    const script = await loadScript();
    await script.main(["--limit", "50", "--run"]);

    const ports = calls.map((call) => Number(new URL(call.url).port));
    expect(ports).toContain(7881);
    expect(ports).toContain(8992);
  });

  test("missing-movie filter excludes announced / hasFile / unmonitored", async () => {
    const calls = captureFetch({
      "GET /api/v3/queue": () => ({ records: [], totalRecords: 0 }),
      "GET /api/v3/movie": () => [
        { id: 1, title: "Announced", status: "announced", hasFile: false, monitored: true, titleSlug: "a" },
        { id: 2, title: "HasFile", status: "released", hasFile: true, monitored: true, titleSlug: "b" },
        { id: 3, title: "Unmonitored", status: "released", hasFile: false, monitored: false, titleSlug: "c" },
        { id: 4, title: "Real Missing", status: "released", hasFile: false, monitored: true, titleSlug: "d" },
      ],
      "POST /api/v3/command": () => ({ status: "ok" }),
    });

    const script = await loadScript();
    await script.main(["--radarr-only", "--limit", "50", "--run"]);

    const triggeredIds = calls
      .filter((c) => c.url.endsWith("/api/v3/command"))
      .map((c) => (c.body as { movieIds: number[] }).movieIds)
      .flat();
    // Each of the 4 configured Radarr instances should narrow down to id=4 only.
    expect(triggeredIds).toEqual([4, 4, 4, 4]);
  });

  test("--limit caps the number of trigger calls per instance", async () => {
    const calls = captureFetch({
      "GET /api/v3/queue": () => ({ records: [], totalRecords: 0 }),
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
    await script.main(["--radarr-only", "--limit", "3", "--run"]);

    // 4 instances × 3 triggers = 12.
    const triggers = calls.filter((c) => c.url.endsWith("/api/v3/command"));
    expect(triggers.length).toBe(12);
  });

  test("clears only blocked completed imports older than one hour and skips queued searches", async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const calls = captureFetch({
      "GET /api/v3/queue": () => ({
        records: [
          { id: 101, movieId: 1, title: "Stuck", added: old, status: "completed", trackedDownloadState: "importBlocked" },
          { id: 102, movieId: 2, title: "Downloading", added: old, status: "downloading", trackedDownloadState: "downloading" },
          { id: 103, movieId: 3, title: "Recent", added: recent, status: "completed", trackedDownloadState: "importBlocked" },
        ],
        totalRecords: 3,
      }),
      "DELETE /api/v3/queue/": () => undefined,
      "GET /api/v3/movie": () => [1, 2, 3].map((id) => ({
        id,
        title: `Missing ${id}`,
        status: "released",
        hasFile: false,
        monitored: true,
        titleSlug: `movie-${id}`,
      })),
      "POST /api/v3/command": () => ({ status: "ok" }),
    });

    const script = await loadScript();
    await script.main(["--radarr-only", "--run"]);

    const deletes = calls.filter((call) => call.method === "DELETE");
    expect(deletes).toHaveLength(4);
    expect(deletes.every((call) => call.url.endsWith(
      "/api/v3/queue/101?removeFromClient=true&blocklist=true&skipRedownload=false",
    ))).toBe(true);
    expect(calls.some((call) => call.url.endsWith("/api/v3/command"))).toBe(false);
  });

  test("clears stale Sonarr imports and searches only episodes outside the queue", async () => {
    const calls = captureFetch({
      "GET /api/v3/queue": () => ({
        records: [{
          id: 201,
          episodeId: 11,
          seriesId: 5,
          title: "Stuck episode",
          added: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          status: "completed",
          trackedDownloadState: "importBlocked",
        }],
        totalRecords: 1,
      }),
      "DELETE /api/v3/queue/": () => undefined,
      "GET /api/v3/wanted/missing": () => ({
        records: [
          { id: 11, seriesId: 5, seasonNumber: 1, episodeNumber: 1, title: "Pilot", series: { title: "The Show" } },
          { id: 12, seriesId: 5, seasonNumber: 1, episodeNumber: 2, title: "Second Episode", series: { title: "The Show" } },
        ],
        totalRecords: 2,
      }),
      "POST /api/v3/command": () => ({ status: "ok" }),
    });

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...values) => logs.push(values.join(" "));
    try {
      const script = await loadScript();
      await script.main(["--sonarr-only", "--run"]);
    } finally {
      console.log = originalLog;
    }

    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(4);
    const searchedIds = calls
      .filter((call) => call.url.endsWith("/api/v3/command"))
      .flatMap((call) => (call.body as { episodeIds: number[] }).episodeIds);
    expect(searchedIds).toEqual([12, 12, 12, 12]);
    expect(logs.some((line) => line.includes("deleted + blocklisted: [queue 201] Stuck episode"))).toBe(true);
    expect(logs.some((line) => line.includes(
      "search requested: The Show S01E02 — Second Episode [episode 12]",
    ))).toBe(true);
  });

  test("dry-run reports stale imports without deleting or searching queued items", async () => {
    const calls = captureFetch({
      "GET /api/v3/queue": () => ({
        records: [{
          id: 101,
          movieId: 1,
          title: "Stuck",
          added: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          status: "completed",
          trackedDownloadState: "importBlocked",
        }],
        totalRecords: 1,
      }),
      "GET /api/v3/movie": () => [
        { id: 1, title: "Real Missing", status: "released", hasFile: false, monitored: true, titleSlug: "a" },
      ],
    });

    const script = await loadScript();
    await script.main(["--radarr-only"]);

    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
    expect(calls.some((call) => call.url.endsWith("/api/v3/command"))).toBe(false);
  });
});
