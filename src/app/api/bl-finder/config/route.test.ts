/**
 * Unit tests for GET/PUT /api/bl-finder/config
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { getRequest, jsonBody, jsonRequest, status } from "@/test-utils/route-helpers";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.setting.deleteMany();
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("GET /api/bl-finder/config", () => {
  test("returns defaults when no row is stored", async () => {
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/bl-finder/config"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      config: { intervalSec: number; batchSize: number };
      defaults: { intervalSec: number };
    };
    expect(body.config.intervalSec).toBe(60);
    expect(body.config.batchSize).toBe(5);
    expect(body.defaults.intervalSec).toBe(60);
  });
});

describe("PUT /api/bl-finder/config", () => {
  test("merges partial updates into the stored config", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/bl-finder/config", { batchSize: 20 }, "PUT"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      config: { batchSize: number; intervalSec: number };
    };
    expect(body.config.batchSize).toBe(20);
    // Untouched fields keep their defaults.
    expect(body.config.intervalSec).toBe(60);
  });

  test("validates input — rejects negative batchSize", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/bl-finder/config", { batchSize: -1 }, "PUT"));
    expect(status(res)).toBe(400);
  });

  test("validates input — rejects timeoutSec > 600", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/bl-finder/config", { timeoutSec: 9999 }, "PUT"));
    expect(status(res)).toBe(400);
  });

  test("validates input — rejects invalid JSON body", async () => {
    const { PUT } = await loadRoute();
    const req = new (await import("next/server")).NextRequest(
      "http://localhost/api/bl-finder/config",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "not json",
        duplex: "half",
      },
    );
    const res = await PUT(req);
    expect(status(res)).toBe(400);
  });

  test("subsequent GET returns the merged config", async () => {
    const { PUT, GET } = await loadRoute();
    await PUT(jsonRequest("/api/bl-finder/config", { concurrency: 8 }, "PUT"));
    const res = await GET(getRequest("/api/bl-finder/config"));
    const body = (await jsonBody(res)) as { config: { concurrency: number; intervalSec: number } };
    expect(body.config.concurrency).toBe(8);
    expect(body.config.intervalSec).toBe(60);
  });

  test("accepts enabled=false and persists it", async () => {
    const { PUT, GET } = await loadRoute();
    const r1 = await PUT(jsonRequest("/api/bl-finder/config", { enabled: false }, "PUT"));
    expect(status(r1)).toBe(200);
    const b1 = (await jsonBody(r1)) as { config: { enabled: boolean } };
    expect(b1.config.enabled).toBe(false);
    const r2 = await GET(getRequest("/api/bl-finder/config"));
    const b2 = (await jsonBody(r2)) as { config: { enabled: boolean } };
    expect(b2.config.enabled).toBe(false);
  });
});
