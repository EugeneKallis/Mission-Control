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
import { jsonRequest, getRequest, jsonBody, status } from "@/test-utils/route-helpers";

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
    const body = (await jsonBody(res)) as { real_debrid_api_key: string };
    expect(body.real_debrid_api_key).toBe("");
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
});
