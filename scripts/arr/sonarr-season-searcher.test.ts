/**
 * Integration test for sonarr-season-searcher: triggers SeasonSearch for
 * fully-aired, monitored, file-less seasons.
 *
 * Mocks resolveConfig from @/lib/config to return controlled Arr instances
 * (avoiding the real DB) and mocks fetch for Arr API calls.
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
        { type: "sonarr", name: "Sonarr", url: "http://127.0.0.1:8989", apiKey: "sonarr-key" },
      ],
    }),
  }));
  const stamp = Date.now() + Math.random();
  return (await import(`./sonarr-season-searcher?bust=${stamp}`)) as typeof import("./sonarr-season-searcher");
}

describe("sonarr-season-searcher", () => {
  test("triggers SeasonSearch for fully-aired, monitored, file-less seasons", async () => {
    const calls = captureFetch({
      "GET /api/v3/series": () => [
        { id: 100, title: "Foo", titleSlug: "foo", path: "/tv/foo", tvdbId: 1, monitored: true },
      ],
      "GET /api/v3/episode": () => [
        // Season 1: monitored, aired, no file → should trigger
        { id: 1, seriesId: 100, seasonNumber: 1, episodeNumber: 1, hasFile: false, monitored: true, airDateUtc: "2020-01-01T00:00:00Z" },
        { id: 2, seriesId: 100, seasonNumber: 1, episodeNumber: 2, hasFile: false, monitored: true, airDateUtc: "2020-01-08T00:00:00Z" },
        // Season 2: every episode has a file → skip
        { id: 3, seriesId: 100, seasonNumber: 2, episodeNumber: 1, hasFile: true, monitored: true, airDateUtc: "2021-01-01T00:00:00Z" },
        // Season 3: unmonitored → skip
        { id: 4, seriesId: 100, seasonNumber: 3, episodeNumber: 1, hasFile: false, monitored: false, airDateUtc: "2022-01-01T00:00:00Z" },
        // Season 4: unaired → skip
        { id: 5, seriesId: 100, seasonNumber: 4, episodeNumber: 1, hasFile: false, monitored: true, airDateUtc: "2099-01-01T00:00:00Z" },
      ],
      "POST /api/v3/command": () => ({ status: "ok" }),
    });

    const script = await loadScript();
    await script.main(["--no-dry-run"]);

    // Exactly one SeasonSearch, for series 100 season 1.
    const commands = calls.filter((c) => c.url.endsWith("/api/v3/command"));
    expect(commands.length).toBe(1);
    expect(commands[0].body).toEqual({ name: "SeasonSearch", seriesId: 100, seasonNumber: 1 });
  });

  test("LIVE mode (--no-dry-run) triggers SeasonSearch for eligible seasons", async () => {
    const calls = captureFetch({
      "GET /api/v3/series": () => [
        { id: 100, title: "Foo", titleSlug: "foo", path: "/tv/foo", tvdbId: 1, monitored: true },
      ],
      "GET /api/v3/episode": () => [
        { id: 1, seriesId: 100, seasonNumber: 1, episodeNumber: 1, hasFile: false, monitored: true, airDateUtc: "2020-01-01T00:00:00Z" },
      ],
      "POST /api/v3/command": () => ({ status: "ok" }),
    });

    const script = await loadScript();
    await script.main(["--no-dry-run"]); // explicitly live

    const commands = calls.filter((c) => c.url.endsWith("/api/v3/command"));
    expect(commands.length).toBe(1);
  });

  test("--dry-run skips SeasonSearch commands and only logs", async () => {
    const calls = captureFetch({
      "GET /api/v3/series": () => [
        { id: 100, title: "Foo", titleSlug: "foo", path: "/tv/foo", tvdbId: 1, monitored: true },
      ],
      "GET /api/v3/episode": () => [
        { id: 1, seriesId: 100, seasonNumber: 1, episodeNumber: 1, hasFile: false, monitored: true, airDateUtc: "2020-01-01T00:00:00Z" },
        { id: 2, seriesId: 100, seasonNumber: 1, episodeNumber: 2, hasFile: false, monitored: true, airDateUtc: "2020-01-08T00:00:00Z" },
      ],
      // No POST handler — if dry-run accidentally issues a command,
      // the test-fetch helper will throw "Unmocked fetch" and the
      // script will propagate it as a failure.
    });

    const script = await loadScript();
    await script.main(["--dry-run"]);

    const commands = calls.filter((c) => c.url.endsWith("/api/v3/command"));
    expect(commands.length).toBe(0);
  });
});
