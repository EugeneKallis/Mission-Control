/**
 * Unit tests for src/lib/arr-config.ts
 *
 * Covers:
 *  - Canonical definitions cover all ten instances with correct types
 *  - DB key generation matches expected flat keys
 *  - ARR_CONFIG_DB_KEYS is the full set of 20 keys
 *  - Env key generation matches expected env var names
 *  - resolveArrInstances resolves all ten from defaults with no env/DB
 *  - env > DB > default precedence for both URL and API key
 *  - env wins over DB
 *  - DB fills in when env is empty
 *  - Partial DB values partial fill
 *  - Empty/missing DB values preserve defaults
 */

import { describe, test, expect } from "bun:test";
import {
  ARR_INSTANCE_DEFINITIONS,
  ARR_CONFIG_DB_KEYS,
  envKeyForApiKey,
  envKeyForUrl,
  arrConfigDbKey,
  resolveArrInstances,
  parseArrImport,
} from "./arr-config";

// ── Canonical definitions ─────────────────────────────────────────────────

describe("ARR_INSTANCE_DEFINITIONS", () => {
  test("has exactly 10 definitions", () => {
    expect(ARR_INSTANCE_DEFINITIONS.length).toBe(10);
  });

  test("every definition has required fields", () => {
    for (const def of ARR_INSTANCE_DEFINITIONS) {
      expect(def.name).toBeTruthy();
      expect(def.slug).toBeTruthy();
      expect(["radarr", "sonarr"]).toContain(def.type);
      expect(def.defaultUrl).toMatch(/^https?:\/\//);
    }
  });

  test("five radarr instances exist", () => {
    const radarrs = ARR_INSTANCE_DEFINITIONS.filter((d) => d.type === "radarr");
    expect(radarrs.length).toBe(5);
    expect(radarrs.map((d) => d.slug).sort()).toEqual([
      "radarr",
      "radarr4k",
      "radarranime",
      "radarrkids",
      "radarrlocal",
    ]);
  });

  test("five sonarr instances exist", () => {
    const sonarrs = ARR_INSTANCE_DEFINITIONS.filter((d) => d.type === "sonarr");
    expect(sonarrs.length).toBe(5);
    expect(sonarrs.map((d) => d.slug).sort()).toEqual([
      "sonarr",
      "sonarr4k",
      "sonarranime",
      "sonarrkids",
      "sonarrlocal",
    ]);
  });

  test("all ten names are unique", () => {
    const names = ARR_INSTANCE_DEFINITIONS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("all ten slugs are unique", () => {
    const slugs = ARR_INSTANCE_DEFINITIONS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

// ── DB key helpers ────────────────────────────────────────────────────────

describe("arrConfigDbKey", () => {
  test("generates correct api_key key for radarr", () => {
    expect(arrConfigDbKey("radarr", "api_key")).toBe("arr_radarr_api_key");
  });

  test("generates correct url key for sonarr4k", () => {
    expect(arrConfigDbKey("sonarr4k", "url")).toBe("arr_sonarr4k_url");
  });
});

describe("ARR_CONFIG_DB_KEYS", () => {
  test("has exactly 20 keys (2 per instance)", () => {
    expect(ARR_CONFIG_DB_KEYS.length).toBe(20);
  });

  test("includes arr_radarr_api_key and arr_radarr_url", () => {
    expect(ARR_CONFIG_DB_KEYS).toContain("arr_radarr_api_key");
    expect(ARR_CONFIG_DB_KEYS).toContain("arr_radarr_url");
  });

  test("includes arr_sonarrlocal_api_key and arr_sonarrlocal_url", () => {
    expect(ARR_CONFIG_DB_KEYS).toContain("arr_sonarrlocal_api_key");
    expect(ARR_CONFIG_DB_KEYS).toContain("arr_sonarrlocal_url");
  });

  test("every key matches the pattern arr_<slug>_<url|api_key>", () => {
    for (const key of ARR_CONFIG_DB_KEYS) {
      expect(key).toMatch(/^arr_[a-z0-9]+_(?:url|api_key)$/);
    }
  });
});

// ── Env key helpers ───────────────────────────────────────────────────────

describe("envKeyForApiKey", () => {
  test("generates ARR__RADARR__API_KEY from radarr", () => {
    expect(envKeyForApiKey("radarr")).toBe("ARR__RADARR__API_KEY");
  });

  test("generates ARR__SONARR4K__API_KEY from sonarr4k", () => {
    expect(envKeyForApiKey("sonarr4k")).toBe("ARR__SONARR4K__API_KEY");
  });
});

describe("envKeyForUrl", () => {
  test("generates ARR__RADARR__URL from radarr", () => {
    expect(envKeyForUrl("radarr")).toBe("ARR__RADARR__URL");
  });

  test("generates ARR__SONARRLOCAL__URL from sonarrlocal", () => {
    expect(envKeyForUrl("sonarrlocal")).toBe("ARR__SONARRLOCAL__URL");
  });
});

// ── resolveArrInstances ───────────────────────────────────────────────────

describe("resolveArrInstances", () => {
  test("returns all ten instances with default URLs and empty API keys when no env/DB", () => {
    const instances = resolveArrInstances({});
    expect(instances.length).toBe(10);

    const radarr = instances.find((i) => i.name === "Radarr");
    expect(radarr).toBeDefined();
    expect(radarr!.url).toBe("http://192.168.1.111:7878");
    expect(radarr!.apiKey).toBe("");
    expect(radarr!.type).toBe("radarr");

    const sonarr = instances.find((i) => i.name === "Sonarr");
    expect(sonarr).toBeDefined();
    expect(sonarr!.url).toBe("http://192.168.1.111:8989");
    expect(sonarr!.apiKey).toBe("");
    expect(sonarr!.type).toBe("sonarr");
  });

  test("env API key wins over DB and default", () => {
    const instances = resolveArrInstances(
      { ARR__RADARR__API_KEY: "env-radarr-key" },
      { arr_radarr_api_key: "db-radarr-key" },
    );
    const radarr = instances.find((i) => i.name === "Radarr")!;
    expect(radarr.apiKey).toBe("env-radarr-key");
  });

  test("DB API key fills in when env is empty", () => {
    const instances = resolveArrInstances(
      {},
      { arr_radarr_api_key: "db-radarr-key" },
    );
    const radarr = instances.find((i) => i.name === "Radarr")!;
    expect(radarr.apiKey).toBe("db-radarr-key");
  });

  test("API key defaults to empty string when neither env nor DB is set", () => {
    const instances = resolveArrInstances({});
    const radarr = instances.find((i) => i.name === "Radarr")!;
    expect(radarr.apiKey).toBe("");
  });

  test("env URL wins over DB and default", () => {
    const instances = resolveArrInstances(
      { ARR__RADARR__URL: "http://env-radarr:7878" },
      { arr_radarr_url: "http://db-radarr:7878" },
    );
    const radarr = instances.find((i) => i.name === "Radarr")!;
    expect(radarr.url).toBe("http://env-radarr:7878");
  });

  test("DB URL fills in when env is empty", () => {
    const instances = resolveArrInstances(
      {},
      { arr_radarr_url: "http://db-radarr:7878" },
    );
    const radarr = instances.find((i) => i.name === "Radarr")!;
    expect(radarr.url).toBe("http://db-radarr:7878");
  });

  test("URL falls back to default when neither env nor DB is set", () => {
    const instances = resolveArrInstances({});
    const radarr = instances.find((i) => i.name === "Radarr")!;
    expect(radarr.url).toBe("http://192.168.1.111:7878");
  });

  test("empty env string does NOT override", () => {
    const instances = resolveArrInstances(
      { ARR__RADARR__URL: "", ARR__RADARR__API_KEY: "" },
      { arr_radarr_url: "http://db-radarr:7878", arr_radarr_api_key: "db-key" },
    );
    const radarr = instances.find((i) => i.name === "Radarr")!;
    expect(radarr.url).toBe("http://db-radarr:7878");
    expect(radarr.apiKey).toBe("db-key");
  });

  test("partial DB values: fills only the instances that have DB entries", () => {
    const instances = resolveArrInstances({}, {
      arr_radarr_url: "http://custom-radarr:7878",
      arr_radarr_api_key: "custom-key",
    });
    const radarr = instances.find((i) => i.name === "Radarr")!;
    expect(radarr.url).toBe("http://custom-radarr:7878");
    expect(radarr.apiKey).toBe("custom-key");

    // Sonarr should have default values
    const sonarr = instances.find((i) => i.name === "Sonarr")!;
    expect(sonarr.url).toBe("http://192.168.1.111:8989");
    expect(sonarr.apiKey).toBe("");
  });
});

// ── All ten instances resolve correctly ──────────────────────────────────

describe("resolveArrInstances — all ten instances", () => {
  test("all radarr instances have correct type and default URLs", () => {
    const instances = resolveArrInstances({});
    const expectedRadarr: Record<string, string> = {
      Radarr: "http://192.168.1.111:7878",
      Radarr4K: "http://192.168.1.111:7879",
      RadarrKids: "http://192.168.1.111:7880",
      RadarrAnime: "http://192.168.1.111:7881",
      RadarrLocal: "http://192.168.1.111:7882",
    };
    for (const [name, url] of Object.entries(expectedRadarr)) {
      const inst = instances.find((i) => i.name === name);
      expect(inst).toBeDefined();
      expect(inst!.type).toBe("radarr");
      expect(inst!.url).toBe(url);
      expect(inst!.apiKey).toBe("");
    }
  });

  test("all sonarr instances have correct type and default URLs", () => {
    const instances = resolveArrInstances({});
    const expectedSonarr: Record<string, string> = {
      Sonarr: "http://192.168.1.111:8989",
      Sonarr4K: "http://192.168.1.111:8990",
      SonarrKids: "http://192.168.1.111:8991",
      SonarrAnime: "http://192.168.1.111:8992",
      SonarrLocal: "http://192.168.1.111:8993",
    };
    for (const [name, url] of Object.entries(expectedSonarr)) {
      const inst = instances.find((i) => i.name === name);
      expect(inst).toBeDefined();
      expect(inst!.type).toBe("sonarr");
      expect(inst!.url).toBe(url);
      expect(inst!.apiKey).toBe("");
    }
  });

  test("DB values for all ten instances resolve correctly", () => {
    const allDbKeys: Record<string, string> = {};
    for (const def of ARR_INSTANCE_DEFINITIONS) {
      allDbKeys[arrConfigDbKey(def.slug, "url")] = `http://${def.slug}:1234`;
      allDbKeys[arrConfigDbKey(def.slug, "api_key")] = `key-${def.slug}`;
    }
    const instances = resolveArrInstances({}, allDbKeys);
    expect(instances.length).toBe(10);
    for (const inst of instances) {
      const slug = inst.name.toLowerCase();
      expect(inst.url).toBe(`http://${slug}:1234`);
      expect(inst.apiKey).toBe(`key-${slug}`);
    }
  });

  test("env values for all ten instances win over DB", () => {
    const envKeys: Record<string, string> = {};
    const dbKeys: Record<string, string> = {};
    for (const def of ARR_INSTANCE_DEFINITIONS) {
      envKeys[envKeyForApiKey(def.slug)] = `env-${def.slug}-key`;
      envKeys[envKeyForUrl(def.slug)] = `http://env-${def.slug}:9999`;
      dbKeys[arrConfigDbKey(def.slug, "api_key")] = `db-${def.slug}-key`;
      dbKeys[arrConfigDbKey(def.slug, "url")] = `http://db-${def.slug}:8888`;
    }
    const instances = resolveArrInstances(envKeys, dbKeys);
    for (const inst of instances) {
      const slug = inst.name.toLowerCase();
      expect(inst.apiKey).toBe(`env-${slug}-key`);
      expect(inst.url).toBe(`http://env-${slug}:9999`);
    }
  });
});

// ── parseArrImport ────────────────────────────────────────────────────────

describe("parseArrImport", () => {
  test("returns empty result for empty text", () => {
    const result = parseArrImport("");
    expect(result.entries).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  test("returns empty result for whitespace-only text", () => {
    const result = parseArrImport("   \n  \n  ");
    expect(result.entries).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  test("parses a single record", () => {
    const result = parseArrImport(
      "radarr\nhttp://192.168.1.111:7878\nmy-api-key",
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      name: "Radarr",
      slug: "radarr",
      url: "http://192.168.1.111:7878",
      apiKey: "my-api-key",
    });
    expect(result.issues).toEqual([]);
  });

  test("ignores blank lines between records", () => {
    const result = parseArrImport(
      "radarr\nhttp://a:7878\nk1\n\nsonarr\nhttp://b:8989\nk2",
    );
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].name).toBe("Radarr");
    expect(result.entries[1].name).toBe("Sonarr");
    expect(result.issues).toEqual([]);
  });

  test("handles adjacent triples without blank line separator", () => {
    const result = parseArrImport(
      "radarr\nhttp://a:7878\nk1\nsonarr\nhttp://b:8989\nk2",
    );
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].name).toBe("Radarr");
    expect(result.entries[1].name).toBe("Sonarr");
    expect(result.issues).toEqual([]);
  });

  test("parses all ten instances", () => {
    const lines = ARR_INSTANCE_DEFINITIONS.flatMap(
      (d) => [d.slug, d.defaultUrl, `key-${d.slug}`],
    ).join("\n");
    const result = parseArrImport(lines);
    expect(result.entries).toHaveLength(10);
    expect(result.issues).toEqual([]);
    const names = result.entries.map((e) => e.name);
    for (const def of ARR_INSTANCE_DEFINITIONS) {
      expect(names).toContain(def.name);
    }
  });

  test("matches names case-insensitively", () => {
    const result = parseArrImport(
      "RADARR\nhttp://a:7878\nk1\nSonarr4K\nhttp://b:8990\nk2\nradarrlocal\nhttp://c:7882\nk3",
    );
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].name).toBe("Radarr");
    expect(result.entries[1].name).toBe("Sonarr4K");
    expect(result.entries[2].name).toBe("RadarrLocal");
    expect(result.issues).toEqual([]);
  });

  test("reports unknown names without adding them", () => {
    const result = parseArrImport(
      "radarr\nhttp://a:7878\nk1\nadarr\nhttp://b:7878\nk2",
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe("Radarr");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("unknown_name");
    expect(result.issues[0].message).toContain("adarr");
    // API key should NOT appear in issue messages
    expect(result.issues[0].message).not.toContain("k2");
  });

  test("reports invalid URL and does not populate entry", () => {
    const result = parseArrImport(
      "radarr\nbad-url\nk1",
    );
    expect(result.entries).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("invalid_url");
    expect(result.issues[0].message).toContain("Radarr");
    // API key should NOT appear
    expect(result.issues[0].message).not.toContain("k1");
  });

  test("reports incomplete final record", () => {
    const result = parseArrImport(
      "radarr\nhttp://a:7878\nk1\nsonarr\nhttp://b:8989",
    );
    // Two entries from the first complete triple, one issue for incomplete
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe("Radarr");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("incomplete_record");
    expect(result.issues[0].message).toMatch(/only 2 line/);
    // API key should NOT appear
    expect(result.issues[0].message).not.toContain("k1");
  });

  test("reports duplicate and keeps last occurrence", () => {
    const result = parseArrImport(
      "radarr\nhttp://first:7878\nk-first\nradarr\nhttp://second:7878\nk-second",
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].url).toBe("http://second:7878");
    expect(result.entries[0].apiKey).toBe("k-second");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("duplicate_name");
    expect(result.issues[0].message).toContain("Radarr");
    // API key should NOT appear
    expect(result.issues[0].message).not.toContain("k-first");
    expect(result.issues[0].message).not.toContain("k-second");
  });

  test("reports both invalid URL and duplicate", () => {
    const result = parseArrImport(
      "radarr\nhttp://a:7878\nk1\nradarr\nftp://bad\nk2",
    );
    // First entry (valid URL) remains; invalid second entry not populated
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].url).toBe("http://a:7878");
    expect(result.entries[0].apiKey).toBe("k1");
    expect(result.issues).toHaveLength(2);
    const types = result.issues.map((i) => i.type).sort();
    expect(types).toEqual(["duplicate_name", "invalid_url"]);
  });

  test("reports both unknown name and incomplete trailing record", () => {
    const result = parseArrImport(
      "radarr\nhttp://a:7878\nk1\nunknownX",
    );
    expect(result.entries).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe("incomplete_record");
  });

  test("does not include API key values in any issue message", () => {
    const result = parseArrImport(
      "radarr\nhttp://a:7878\nsecret-api-key-123\nunknownX\nhttp://b:8989\nanother-secret-456\nadarr\nhttp://c:7878\nyet-another-secret-789",
    );
    for (const issue of result.issues) {
      expect(issue.message).not.toContain("secret-api-key-123");
      expect(issue.message).not.toContain("another-secret-456");
      expect(issue.message).not.toContain("yet-another-secret-789");
    }
  });

  test("trimmed lines prevent blank-line issues", () => {
    const result = parseArrImport(
      "radarr   \n  http://a:7878\n  k1-with-spaces  ",
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].url).toBe("http://a:7878");
    expect(result.entries[0].apiKey).toBe("k1-with-spaces");
    expect(result.issues).toEqual([]);
  });
});
