/**
 * Unit tests for /api/config (GET + PUT)
 *
 * Mocks @/lib/db/queries and re-imports the route module with a
 * cache-busting query string so the mocks take effect.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";
import { CONFIG_FIELDS } from "@/lib/config-fields";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.config.deleteMany();
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── GET /api/config ───────────────────────────────────────────────────────

describe("GET /api/config", () => {
  test("returns 200 with the parsed config values (default)", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { real_debrid_api_key: string; pulse_api_key: string };
    expect(body.real_debrid_api_key).toBe("");
    expect(body.pulse_api_key).toBe("");
    for (const field of CONFIG_FIELDS) expect(Object.hasOwn(body, field.key)).toBe(true);
  });

  test("returns 200 with the stored config values", async () => {
    await testDB.db.config.upsert({
      where: { id: 1 },
      update: { configJson: JSON.stringify({ real_debrid_api_key: "secret-xyz" }) },
      create: { id: 1, configJson: JSON.stringify({ real_debrid_api_key: "secret-xyz" }) },
    });
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { real_debrid_api_key: string };
    expect(body.real_debrid_api_key).toBe("secret-xyz");
  });

  test("returns 500 when the stored config is not valid JSON", async () => {
    await testDB.db.config.upsert({
      where: { id: 1 },
      update: { configJson: "not-json{" },
      create: { id: 1, configJson: "not-json{" },
    });
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to fetch config" });
  });
});

// ── PUT /api/config ───────────────────────────────────────────────────────

describe("PUT /api/config", () => {
  test("returns 500 on invalid JSON body (route has no separate JSON-parse try-catch)", async () => {
    const { PUT } = await loadRoute();
    const req = new Request("http://localhost/api/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await PUT(req);
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to save config" });
  });

  test("returns 400 on validation failure (key has wrong type)", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/config", { real_debrid_api_key: 123 }, "PUT"));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string; details: unknown };
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  test("returns 200 with merged config on happy path", async () => {
    // Seed existing config to verify merge behavior
    await testDB.db.config.upsert({
      where: { id: 1 },
      update: { configJson: JSON.stringify({ real_debrid_api_key: "old-key" }) },
      create: { id: 1, configJson: JSON.stringify({ real_debrid_api_key: "old-key" }) },
    });
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/config", { real_debrid_api_key: "new-key" }, "PUT"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { real_debrid_api_key: string };
    expect(body.real_debrid_api_key).toBe("new-key");

    // Verify the DB was updated
    const stored = await testDB.db.config.findUnique({ where: { id: 1 } });
    const parsed = JSON.parse(stored!.configJson) as { real_debrid_api_key: string };
    expect(parsed.real_debrid_api_key).toBe("new-key");
  });

  test("creates config row when none exists", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/config", { real_debrid_api_key: "first-key" }, "PUT"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { real_debrid_api_key: string };
    expect(body.real_debrid_api_key).toBe("first-key");
  });

  test("returns 200 with empty object when no real_debrid_api_key provided", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/config", {}, "PUT"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Record<string, unknown>;
    // Existing config (default) should be preserved
    expect(body.real_debrid_api_key).toBe("");
  });

  // ── Cache-Control header ───────────────────────────────────────────

  test("GET returns Cache-Control: no-store", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  test("PUT returns Cache-Control: no-store on success", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/config", { real_debrid_api_key: "x" }, "PUT"));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  test("PUT returns Cache-Control: no-store on error", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/config", { arr_radarr_url: "invalid" }, "PUT"),
    );
    expect(status(res)).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  test("GET returns Cache-Control: no-store on error", async () => {
    await testDB.db.config.upsert({
      where: { id: 1 },
      update: { configJson: "not-json{" },
      create: { id: 1, configJson: "not-json{" },
    });
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  // ── Arr URL validation ────────────────────────────────────────────

  test("rejects arr URL that does not use http:// or https://", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/config", { arr_radarr_url: "ftp://bad" }, "PUT"),
    );
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string; details: { fieldErrors: Record<string, string[]> } };
    expect(body.error).toBe("Validation failed");
    expect(body.details.fieldErrors.arr_radarr_url).toBeDefined();
    expect(body.details.fieldErrors.arr_radarr_url[0]).toMatch(/http/i);
  });

  test("rejects arr URL with no scheme", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/config", { arr_sonarr_url: "localhost:8989" }, "PUT"),
    );
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string; details: { fieldErrors: Record<string, string[]> } };
    expect(body.error).toBe("Validation failed");
    expect(body.details.fieldErrors.arr_sonarr_url).toBeDefined();
  });

  test("accepts arr URL with http:// scheme", async () => {
    const { PUT, GET } = await loadRoute();
    const putRes = await PUT(
      jsonRequest("/api/config", { arr_radarr_url: "http://radarr:7878" }, "PUT"),
    );
    expect(status(putRes)).toBe(200);
    const putBody = (await jsonBody(putRes)) as Record<string, string>;
    expect(putBody.arr_radarr_url).toBe("http://radarr:7878");

    const getRes = await GET();
    expect(status(getRes)).toBe(200);
    const getBody = (await jsonBody(getRes)) as Record<string, string>;
    expect(getBody.arr_radarr_url).toBe("http://radarr:7878");
  });

  test("accepts arr URL with https:// scheme", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/config", { arr_sonarr_url: "https://sonarr.example.com:8989" }, "PUT"),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Record<string, string>;
    expect(body.arr_sonarr_url).toBe("https://sonarr.example.com:8989");
  });

  test("empty string arr URL is accepted (clears stored override)", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/config", { arr_radarr4k_url: "" }, "PUT"),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Record<string, string>;
    expect(body.arr_radarr4k_url).toBe("");
  });

  test("omitted arr URL key is accepted and preserves existing stored value", async () => {
    // Seed an existing URL for radarrlocal so we can verify merge preservation
    await testDB.db.config.upsert({
      where: { id: 1 },
      update: { configJson: JSON.stringify({ arr_radarrlocal_url: "http://radarrlocal:7882" }) },
      create: { id: 1, configJson: JSON.stringify({ arr_radarrlocal_url: "http://radarrlocal:7882" }) },
    });
    const { PUT } = await loadRoute();
    // PUT only the API key — URL should be preserved from existing
    const res = await PUT(
      jsonRequest("/api/config", { arr_radarrlocal_api_key: "local-key" }, "PUT"),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Record<string, string>;
    expect(body.arr_radarrlocal_url).toBe("http://radarrlocal:7882");
    expect(body.arr_radarrlocal_api_key).toBe("local-key");
  });

  // ── Trimming ───────────────────────────────────────────────────────

  test("saves and trims the Pulse API key", async () => {
    const { PUT, GET } = await loadRoute();
    const putRes = await PUT(
      jsonRequest("/api/config", { pulse_api_key: "  pulse-secret  " }, "PUT"),
    );
    expect(status(putRes)).toBe(200);
    const putBody = (await jsonBody(putRes)) as Record<string, string>;
    expect(putBody.pulse_api_key).toBe("pulse-secret");

    const getBody = (await jsonBody(await GET())) as Record<string, string>;
    expect(getBody.pulse_api_key).toBe("pulse-secret");
  });

  test("rejects a Pulse API key with the wrong type", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/config", { pulse_api_key: 123 }, "PUT"));
    expect(status(res)).toBe(400);
  });

  test("trims whitespace from arr URL", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/config", { arr_sonarr_url: "  http://sonarr:8989  " }, "PUT"),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Record<string, string>;
    expect(body.arr_sonarr_url).toBe("http://sonarr:8989");
  });

  test("trims whitespace from arr API key", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/config", { arr_radarr_api_key: "  radarr-secret  " }, "PUT"),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Record<string, string>;
    expect(body.arr_radarr_api_key).toBe("radarr-secret");
  });

  test("trims whitespace from existing config keys", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/config", { real_debrid_api_key: "  rd-key  ", plex_token: "  plex-token  " }, "PUT"),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Record<string, string>;
    expect(body.real_debrid_api_key).toBe("rd-key");
    expect(body.plex_token).toBe("plex-token");
  });

  // ── Arr key round-trip ─────────────────────────────────────────────

  test("saves and returns arr_api_key via PUT and GET", async () => {
    const { PUT, GET } = await loadRoute();
    const putRes = await PUT(
      jsonRequest("/api/config", { arr_radarr_api_key: "radarr-secret" }, "PUT"),
    );
    expect(status(putRes)).toBe(200);
    const putBody = (await jsonBody(putRes)) as Record<string, string>;
    expect(putBody.arr_radarr_api_key).toBe("radarr-secret");

    const getRes = await GET();
    expect(status(getRes)).toBe(200);
    const getBody = (await jsonBody(getRes)) as Record<string, string>;
    expect(getBody.arr_radarr_api_key).toBe("radarr-secret");
  });

  test("saves and returns arr_url via PUT and GET", async () => {
    const { PUT, GET } = await loadRoute();
    const putRes = await PUT(
      jsonRequest("/api/config", { arr_sonarr_url: "http://sonarr:8989" }, "PUT"),
    );
    expect(status(putRes)).toBe(200);
    const putBody = (await jsonBody(putRes)) as Record<string, string>;
    expect(putBody.arr_sonarr_url).toBe("http://sonarr:8989");

    const getRes = await GET();
    expect(status(getRes)).toBe(200);
    const getBody = (await jsonBody(getRes)) as Record<string, string>;
    expect(getBody.arr_sonarr_url).toBe("http://sonarr:8989");
  });

  test("merges arr keys with existing config", async () => {
    await testDB.db.config.upsert({
      where: { id: 1 },
      update: { configJson: JSON.stringify({ real_debrid_api_key: "rd-secret" }) },
      create: { id: 1, configJson: JSON.stringify({ real_debrid_api_key: "rd-secret" }) },
    });
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/config", { arr_radarr4k_api_key: "4k-secret" }, "PUT"),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Record<string, string>;
    expect(body.real_debrid_api_key).toBe("rd-secret");
    expect(body.arr_radarr4k_api_key).toBe("4k-secret");

    const stored = await testDB.db.config.findUnique({ where: { id: 1 } });
    const parsed = JSON.parse(stored!.configJson) as Record<string, string>;
    expect(parsed.real_debrid_api_key).toBe("rd-secret");
    expect(parsed.arr_radarr4k_api_key).toBe("4k-secret");
  });

  test("returns 400 when an arr key has wrong type", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/config", { arr_sonarr_api_key: 123 }, "PUT"),
    );
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string; details: unknown };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 200 when arr keys are empty strings (should not throw)", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/config", { arr_radarr_api_key: "", arr_sonarr_url: "" }, "PUT"),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Record<string, string>;
    expect(body.arr_radarr_api_key).toBe("");
    expect(body.arr_sonarr_url).toBe("");
  });

  test("saves planned feature configuration from the canonical registry", async () => {
    const { PUT, GET } = await loadRoute();
    const values = {
      decypharr_url: "http://decypharr:8282",
      prowlarr_url: "http://prowlarr:9696",
      prowlarr_api_key: "prowlarr-secret",
      tautulli_url: "http://tautulli:8181",
      telegram_bot_token: "telegram-secret",
      internet_check_interval_minutes: "10",
      audit_retention_days: "365",
      cleanup_paths: "/data/one\n/data/two",
      energy_contract_end: "2027-05-01",
    };
    expect(status(await PUT(jsonRequest("/api/config", values, "PUT")))).toBe(200);
    expect(await jsonBody(await GET())).toMatchObject(values);
  });

  test("validates planned feature URLs, numbers, dates, and booleans", async () => {
    const { PUT } = await loadRoute();
    for (const body of [
      { prowlarr_url: "ftp://bad" },
      { audit_retention_days: "0" },
      { energy_monthly_kwh: "many" },
      { energy_contract_end: "tomorrow" },
      { internet_speedtest_enabled: "sometimes" },
    ]) {
      expect(status(await PUT(jsonRequest("/api/config", body, "PUT")))).toBe(400);
    }
  });

  test("ignores unknown config keys", async () => {
    const { PUT } = await loadRoute();
    const body = await jsonBody(await PUT(jsonRequest("/api/config", { unknown_secret: "nope", telegram_chat_id: "123" }, "PUT"))) as Record<string, string>;
    expect(body.telegram_chat_id).toBe("123");
    expect(body.unknown_secret).toBeUndefined();
  });

  test("returns 500 on upsert failure", async () => {
    mock.module("@/lib/db/queries", () => ({
      getConfig: async () => ({ id: 1, configJson: "{}" }),
      upsertConfig: async () => {
        throw new Error("DB write failed");
      },
    }));
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/config", { real_debrid_api_key: "x" }, "PUT"));
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to save config" });
  });

  test("PUT error response has Cache-Control: no-store", async () => {
    mock.module("@/lib/db/queries", () => ({
      getConfig: async () => ({ id: 1, configJson: "{}" }),
      upsertConfig: async () => {
        throw new Error("DB write failed");
      },
    }));
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/config", { real_debrid_api_key: "x" }, "PUT"));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
