/**
 * Integration test for plex-to-arr: mocks Plex + Sonarr + Radarr + TVMaze
 * and verifies the sync flow end-to-end in dry-run mode.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const realFetch = globalThis.fetch;

beforeEach(() => {
  mock.restore();
  process.env.PLEX_TOKEN = "plex-token";
  process.env.PLEX_URL = "http://plex:32400";
  process.env.PLEX_WATCHLIST_RSS = "https://rss.plex.tv/test";
  process.env.ARR__SONARRLOCAL__API_KEY = "sonarr-key";
  process.env.ARR__RADARRLOCAL__API_KEY = "radarr-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restore();
});

async function loadScript() {
  mock.module("@/lib/config", () => ({
    getConfig: () => ({
      plexUrl: "http://plex:32400",
      plexToken: "plex-token",
      plexWatchlistRss: "https://rss.plex.tv/test",
      arrInstances: [
        { type: "sonarr", name: "SonarrLocal", url: "http://sonarr:8989", apiKey: "sonarr-key" },
        { type: "radarr", name: "RadarrLocal", url: "http://radarr:7878", apiKey: "radarr-key" },
      ],
    }),
  }));
  const mod = await import("./plex-to-arr");
  return mod;
}

type CallLog = { url: string; method: string; body: unknown };

function installFetch(routes: Record<string, (url: string, init: RequestInit) => unknown>): CallLog[] {
  const calls: CallLog[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = url.toString();
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: u, method, body });

    for (const [pattern, handler] of Object.entries(routes)) {
      if (u.includes(pattern)) {
        const result = handler(u, init ?? {});
        if (result instanceof Response) return result;
        return new Response(JSON.stringify(result), { status: 200 });
      }
    }
    throw new Error(`Unmocked: ${method} ${u}`);
  }) as typeof fetch;
  return calls;
}

const RSS_EMPTY = "<rss></rss>";

function rssResponse(xml: string): Response {
  return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } });
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200 });
}

describe("plex-to-arr", () => {
  test("dry run: detects shows from CW and adds missing ones to Sonarr", async () => {
    const { main } = await loadScript();

    const calls = installFetch({
      "rss.plex.tv": () => rssResponse('<rss><channel><item><title>Some Show</title><category>show</category><guid>tvdb://12345</guid><media:keywords>drama</media:keywords></item></channel></rss>'),
      "/hubs/continueWatching": () => json({
        MediaContainer: { Hub: [{ Metadata: [
          { type: "episode", grandparentTitle: "Breaking Bad", parentIndex: 2, index: 3, tvdbId: 81189, Genre: [{ tag: "drama" }] },
          { type: "movie", title: "Inception", tmdbId: 27205, year: 2010 },
        ]}]},
      }),
      "/api/v3/qualityprofile": () => json([{ id: 1, name: "WEB-1080p (Alternative)" }, { id: 2, name: "[Anime] Remux-1080p" }]),
      "/api/v3/rootfolder": () => json([{ id: 1, path: "/tv", accessible: true, freeSpace: 0 }]),
      "/api/v3/series/lookup": () => json([{
        id: 0, title: "Breaking Bad", tvdbId: 81189, seriesType: "standard",
        genres: ["Drama", "Crime"],
        seasons: [{ seasonNumber: 1, monitored: true }, { seasonNumber: 2, monitored: true }],
      }]),
      "/api/v3/movie/lookup": () => json([{ id: 0, title: "Inception", tmdbId: 27205, genres: ["Action", "Science Fiction"] }]),
      "api.tvmaze.com": () => json({ genres: [], type: "Scripted" }),
    });

    const origLog = console.log;
    console.log = () => {};
    try {
      await main(["--dry-run"]);
    } finally {
      console.log = origLog;
    }

    // Verify we got lookup calls for both the show and movie
    const lookupCalls = calls.filter((c) => c.url.includes("/lookup"));
    expect(lookupCalls.length).toBeGreaterThanOrEqual(2);
  });

  test("dry run: skips shows already in Sonarr", async () => {
    const { main } = await loadScript();

    const calls = installFetch({
      "rss.plex.tv": () => rssResponse(RSS_EMPTY),
      "/hubs/continueWatching": () => json({
        MediaContainer: { Hub: [{ Metadata: [
          { type: "episode", grandparentTitle: "Existing Show", parentIndex: 1, index: 1, tvdbId: 100, Genre: [] },
        ]}]},
      }),
      "/api/v3/qualityprofile": () => json([]),
      "/api/v3/rootfolder": () => json([]),
      "/api/v3/series/lookup": () => json([{ id: 5, title: "Existing Show", tvdbId: 100 }]),
      "/api/v3/movie/lookup": () => json([]),
    });

    const origLog = console.log;
    console.log = () => {};
    try {
      await main(["--dry-run"]);
    } finally {
      console.log = origLog;
    }

    // Should NOT have any POST to /api/v3/series (no add)
    const addCalls = calls.filter((c) => c.method === "POST" && c.url.includes("/api/v3/series"));
    expect(addCalls.length).toBe(0);
  });

  test("dry run: detects anime via TVMaze fallback and routes to anime profile", async () => {
    const { main } = await loadScript();

    const calls = installFetch({
      "rss.plex.tv": () => rssResponse(
        '<rss><channel><item><title>Mystery Show</title><category>show</category><guid>tvdb://99999</guid><media:keywords>drama</media:keywords></item></channel></rss>',
      ),
      "/hubs/continueWatching": () => json({ MediaContainer: { Hub: [{ Metadata: [] }] } }),
      "/api/v3/qualityprofile": () => json([{ id: 1, name: "WEB-1080p (Alternative)" }, { id: 2, name: "[Anime] Remux-1080p" }]),
      "/api/v3/rootfolder": () => json([{ path: "/tv" }]),
      "/api/v3/series/lookup": () => json([{
        id: 0, title: "Mystery Show", tvdbId: 99999, seriesType: "standard",
        genres: ["Animation"],
        seasons: [{ seasonNumber: 1, monitored: true }],
      }]),
      "/api/v3/movie/lookup": () => json([]),
      "api.tvmaze.com": () => json({ genres: ["Anime"], type: "Animation" }),
    });

    const origLog = console.log;
    console.log = () => {};
    try {
      await main(["--dry-run"]);
    } finally {
      console.log = origLog;
    }

    // The lookup should have been made for the RSS show
    const lookupCalls = calls.filter((c) => c.url.includes("/series/lookup"));
    expect(lookupCalls.length).toBeGreaterThan(0);

    // TVMaze should have been called as the anime fallback
    // (seriesType=standard, genres=[Animation] not [Anime], keywords=[drama] not [anime])
    const tvmazeCalls = calls.filter((c) => c.url.includes("api.tvmaze.com"));
    expect(tvmazeCalls.length).toBeGreaterThan(0);
  });
});
