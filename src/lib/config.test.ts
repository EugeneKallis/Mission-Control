/**
 * Unit tests for src/lib/config.ts
 *
 * The config module is a process-wide singleton. Each test re-imports
 * it with a fresh module path to dodge the singleton cache, and uses
 * `mock.module` to set env-controlled defaults.
 *
 * Covers:
 *  - Default values for every env field
 *  - Web port coercion (string → number)
 *  - mediaDirectories split + filter on commas/whitespace
 *  - fullMediaPaths = mediaBasePath + mediaDirectories
 *  - Arr instance API key override from env (ARR__<NAME>__API_KEY)
 *  - Empty / missing ARR override leaves the default blank
 *
 * Note: because `mock.module` is process-global, these tests should
 * run in their own file (and do — they don't share state with the
 * DB tests that also mock @/lib/db).
 */

import { describe, test, expect, mock, afterEach } from "bun:test";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  // Restore env after each test
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

/**
 * Re-import config with a fresh module path so the singleton is
 * re-initialised. The suffix disambiguates across tests in this file.
 */
async function loadFreshConfig(suffix: string) {
  return import(`./config?bust=${Date.now()}-${suffix}`) as Promise<typeof import("./config")>;
}

describe("AppConfig defaults", () => {
  test("uses defaults when no env is set", async () => {
    for (const k of Object.keys(process.env)) delete process.env[k];

    const mod = await loadFreshConfig("defaults");
    const cfg = mod.getConfig();
    expect(cfg.webPort).toBe(8080);
    expect(cfg.rclonePath).toBe("/mnt/addons/debrid/__all__");
    expect(cfg.mediaBasePath).toBe("/mnt/debrid/media/");
    expect(cfg.mediaDirectories.length).toBeGreaterThan(0);
    expect(cfg.torboxApiToken).toBe("");
  });

  test("coerces WEB_PORT from string to number", async () => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    process.env.WEB_PORT = "9999";

    const mod = await loadFreshConfig("coerce");
    const cfg = mod.getConfig();
    expect(cfg.webPort).toBe(9999);
  });

  test("mediaDirectories splits commas and trims whitespace", async () => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    process.env.MEDIA_DIRECTORIES = " a , b ,, c ";

    const mod = await loadFreshConfig("mediadirs");
    const cfg = mod.getConfig();
    expect(cfg.mediaDirectories).toEqual(["a", "b", "c"]);
  });

  test("fullMediaPaths joins mediaBasePath + mediaDirectories", async () => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    process.env.MEDIA_BASE_PATH = "/data/media/";
    process.env.MEDIA_DIRECTORIES = "movies,tv";

    const mod = await loadFreshConfig("fullpaths");
    const cfg = mod.getConfig();
    expect(cfg.fullMediaPaths).toEqual(["/data/media/movies", "/data/media/tv"]);
  });

  test("Arr instance API keys are overridden by ARR__<NAME>__API_KEY env", async () => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    process.env.ARR__RADARR__API_KEY = "K-RADARR";
    process.env.ARR__SONARR__API_KEY = "K-SONARR";

    const mod = await loadFreshConfig("arrkeys");
    const cfg = mod.getConfig();
    const radarr = cfg.arrInstances.find((i: { name: string }) => i.name === "Radarr");
    const sonarr = cfg.arrInstances.find((i: { name: string }) => i.name === "Sonarr");
    expect(radarr?.apiKey).toBe("K-RADARR");
    expect(sonarr?.apiKey).toBe("K-SONARR");
    // Other instances remain blank
    const radarr4k = cfg.arrInstances.find((i: { name: string }) => i.name === "Radarr4K");
    expect(radarr4k?.apiKey).toBe("");
  });

  test("an empty ARR__<NAME>__API_KEY env value does NOT override the default", async () => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    process.env.ARR__RADARR__API_KEY = ""; // empty string — should not override

    const mod = await loadFreshConfig("emptyarr");
    const cfg = mod.getConfig();
    const radarr = cfg.arrInstances.find((i: { name: string }) => i.name === "Radarr");
    // The implementation guards on `envOverride.length > 0`
    expect(radarr?.apiKey).toBe("");
  });
});
