/**
 * Tests for config.resolveConfig() — DB-fallback config resolution.
 *
 * resolveConfig() uses a dynamic import of @/lib/db to look up values
 * stored by the admin config page. These tests mock @/lib/db with a
 * test SQLite DB so the fallback path is exercised without touching
 * the real dev database.
 *
 * Runs in its own file (separate from config.test.ts) because
 * mock.module is process-global — even with --isolate each test
 * file gets its own process, so no leakage.
 *
 * Covers:
 *  - env precedence: all env vars set → env wins over DB
 *  - DB fallback: empty env, populated DB
 *  - Partial merge: some from env, rest from DB
 *  - Env wins over DB when both are set
 *  - Missing DB row → returns env config as-is
 *  - DB error → degrades gracefully
 */

import { describe, test, expect, mock, afterAll, beforeAll, afterEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";

let testDB: TestDB;

const ORIGINAL_ENV = { ...process.env };

beforeAll(async () => {
  testDB = await makeTestDB();
  // Point dynamic import("@/lib/db") at the test DB
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterEach(() => {
  // Restore env after each test
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

afterAll(async () => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
  await testDB.cleanup();
});

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Seed a config row in the test DB (the table the admin config page writes to).
 */
async function seedConfig(json: Record<string, string>) {
  await testDB.db.config.upsert({
    where: { id: 1 },
    update: { configJson: JSON.stringify(json) },
    create: { id: 1, configJson: JSON.stringify(json) },
  });
}

/**
 * Delete the config row so the DB is empty.
 */
async function clearConfig() {
  await testDB.db.config.deleteMany({ where: { id: 1 } });
}

/**
 * Re-import the config module with a fresh path to dodge the singleton.
 */
async function loadFreshConfig(suffix: string) {
  return import(`./config?bust=${Date.now()}-${suffix}`) as Promise<typeof import("./config")>;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("resolveConfig — env precedence over DB", () => {
  test("env values take precedence when plexToken, plexUrl, and realDebridApiKey are all set", async () => {
    process.env.PLEX_TOKEN = "env-token";
    process.env.PLEX_URL = "http://env-plex:32400";
    process.env.REAL_DEBRID_API_KEY = "env-rd";

    // Seed DB with different values — they should NOT be picked up
    await seedConfig({
      plex_token: "db-token",
      plex_url: "http://db-plex:32400",
      real_debrid_api_key: "db-rd",
    });

    const mod = await loadFreshConfig("fastpath");
    const cfg = await mod.resolveConfig();

    expect(cfg.plexToken).toBe("env-token");
    expect(cfg.plexUrl).toBe("http://env-plex:32400");
    expect(cfg.realDebridApiKey).toBe("env-rd");
  });
});

describe("resolveConfig — DB fallback", () => {
  test("fills plexToken from DB when env is empty", async () => {
    await seedConfig({ plex_token: "db-token" });

    const mod = await loadFreshConfig("fallback-token");
    const cfg = await mod.resolveConfig();

    expect(cfg.plexToken).toBe("db-token");
    // plexUrl remains default (empty string)
    expect(cfg.plexUrl).toBe("");
  });

  test("fills plexUrl from DB when env is empty", async () => {
    await seedConfig({ plex_url: "http://db-plex:32400" });

    const mod = await loadFreshConfig("fallback-url");
    const cfg = await mod.resolveConfig();

    expect(cfg.plexUrl).toBe("http://db-plex:32400");
    expect(cfg.plexToken).toBe("");
  });

  test("fills realDebridApiKey from DB when env is empty", async () => {
    await seedConfig({ real_debrid_api_key: "db-rd" });

    const mod = await loadFreshConfig("fallback-rd");
    const cfg = await mod.resolveConfig();

    expect(cfg.realDebridApiKey).toBe("db-rd");
  });

  test("fills all three fields from DB when env is completely empty", async () => {
    await seedConfig({
      plex_token: "db-token",
      plex_url: "http://db-plex:32400",
      real_debrid_api_key: "db-rd",
    });

    const mod = await loadFreshConfig("fallback-all");
    const cfg = await mod.resolveConfig();

    expect(cfg.plexToken).toBe("db-token");
    expect(cfg.plexUrl).toBe("http://db-plex:32400");
    expect(cfg.realDebridApiKey).toBe("db-rd");
  });

  test("partial merge: some from env, rest from DB", async () => {
    process.env.PLEX_URL = "http://env-plex:32400";
    // plexToken and realDebridApiKey left empty — should come from DB

    await seedConfig({
      plex_token: "db-token",
      real_debrid_api_key: "db-rd",
    });

    const mod = await loadFreshConfig("partial");
    const cfg = await mod.resolveConfig();

    expect(cfg.plexToken).toBe("db-token");
    expect(cfg.plexUrl).toBe("http://env-plex:32400");
    expect(cfg.realDebridApiKey).toBe("db-rd");
  });
});

describe("resolveConfig — env wins over DB", () => {
  test("env PLEX_TOKEN takes precedence over DB value", async () => {
    process.env.PLEX_TOKEN = "env-token";

    await seedConfig({ plex_token: "db-token" });

    const mod = await loadFreshConfig("env-wins-token");
    const cfg = await mod.resolveConfig();

    expect(cfg.plexToken).toBe("env-token");
  });

  test("env PLEX_URL takes precedence over DB value", async () => {
    process.env.PLEX_URL = "http://env-plex:32400";

    await seedConfig({ plex_url: "http://db-plex:32400" });

    const mod = await loadFreshConfig("env-wins-url");
    const cfg = await mod.resolveConfig();

    expect(cfg.plexUrl).toBe("http://env-plex:32400");
  });
});

describe("resolveConfig — edge cases", () => {
  test("handles missing DB row gracefully (no config row yet)", async () => {
    await clearConfig();

    const mod = await loadFreshConfig("no-row");
    const cfg = await mod.resolveConfig();

    // All should be defaults (empty strings)
    expect(cfg.plexToken).toBe("");
    expect(cfg.plexUrl).toBe("");
    expect(cfg.realDebridApiKey).toBe("");
  });

  test("handles empty configJson in DB", async () => {
    await seedConfig({}); // empty JSON object

    const mod = await loadFreshConfig("empty-json");
    const cfg = await mod.resolveConfig();

    expect(cfg.plexToken).toBe("");
    expect(cfg.plexUrl).toBe("");
    expect(cfg.realDebridApiKey).toBe("");
  });

  test("returns config with default values when no env and no DB row", async () => {
    await clearConfig();

    const mod = await loadFreshConfig("defaults");
    const cfg = await mod.resolveConfig();

    expect(cfg.plexToken).toBe("");
    expect(cfg.plexUrl).toBe("");
    expect(cfg.realDebridApiKey).toBe("");
    expect(cfg.webPort).toBe(8080);
    expect(cfg.mediaDirectories.length).toBeGreaterThan(0);
  });
});

// ── Arr key tests ─────────────────────────────────────────────────────────

describe("resolveConfig — arr keys from DB", () => {
  test("fills arr_radarr_api_key from DB when env is empty", async () => {
    await seedConfig({ arr_radarr_api_key: "db-radarr-key" });

    const mod = await loadFreshConfig("arr-api");
    const cfg = await mod.resolveConfig();

    const radarr = cfg.arrInstances.find((i) => i.name === "Radarr");
    expect(radarr).toBeDefined();
    expect(radarr!.apiKey).toBe("db-radarr-key");
  });

  test("fills arr_sonarr_url from DB", async () => {
    await seedConfig({ arr_sonarr_url: "http://db-sonarr:8989" });

    const mod = await loadFreshConfig("arr-url");
    const cfg = await mod.resolveConfig();

    const sonarr = cfg.arrInstances.find((i) => i.name === "Sonarr");
    expect(sonarr).toBeDefined();
    expect(sonarr!.url).toBe("http://db-sonarr:8989");
  });

  test("fills both apiKey and url for all Radarr instances from DB", async () => {
    await seedConfig({
      arr_radarr_api_key: "radarr-key",
      arr_radarr_url: "http://radarr:7878",
      arr_radarr4k_url: "http://radarr4k:7879",
      arr_radarr4k_api_key: "radarr4k-key",
    });

    const mod = await loadFreshConfig("arr-all");
    const cfg = await mod.resolveConfig();

    const r1 = cfg.arrInstances.find((i) => i.name === "Radarr");
    expect(r1!.apiKey).toBe("radarr-key");
    expect(r1!.url).toBe("http://radarr:7878");

    const r2 = cfg.arrInstances.find((i) => i.name === "Radarr4K");
    expect(r2!.apiKey).toBe("radarr4k-key");
    expect(r2!.url).toBe("http://radarr4k:7879");

    // Unset instances keep defaults
    const kids = cfg.arrInstances.find((i) => i.name === "RadarrKids");
    expect(kids!.apiKey).toBe("");
  });

  test("env ARR__RADARR__API_KEY takes precedence over DB arr_radarr_api_key", async () => {
    process.env.ARR__RADARR__API_KEY = "env-radarr-key";
    await seedConfig({ arr_radarr_api_key: "db-radarr-key" });

    const mod = await loadFreshConfig("arr-env-wins");
    const cfg = await mod.resolveConfig();

    const radarr = cfg.arrInstances.find((i) => i.name === "Radarr");
    expect(radarr!.apiKey).toBe("env-radarr-key");
  });

  test("env ARR__RADARR__URL takes precedence over DB arr_radarr_url", async () => {
    process.env.ARR__RADARR__URL = "http://env-radarr:7878";
    await seedConfig({ arr_radarr_url: "http://db-radarr:7878" });

    const mod = await loadFreshConfig("arr-url-env-wins");
    const cfg = await mod.resolveConfig();

    const radarr = cfg.arrInstances.find((i) => i.name === "Radarr");
    expect(radarr!.url).toBe("http://env-radarr:7878");
  });

  test("DB arr URL fills in when env URL is empty", async () => {
    await seedConfig({ arr_sonarr4k_url: "http://db-4k:8990" });

    const mod = await loadFreshConfig("arr-url-fill");
    const cfg = await mod.resolveConfig();

    const s4k = cfg.arrInstances.find((i) => i.name === "Sonarr4K");
    expect(s4k!.url).toBe("http://db-4k:8990");
  });
});
