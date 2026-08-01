/**
 * Tests for GET/PUT /api/pve/thresholds
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

describe("GET /api/pve/thresholds", () => {
  test("returns defaults when no row is stored", async () => {
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/pve/thresholds"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      config: { cpu: number; memory: number; storage: number };
      defaults: { cpu: number; memory: number; storage: number };
    };
    expect(body.config.cpu).toBe(80);
    expect(body.config.memory).toBe(80);
    expect(body.config.storage).toBe(80);
    expect(body.defaults).toEqual(body.config);
  });

  test("falls back to defaults when stored JSON is malformed", async () => {
    await testDB.db.setting.create({
      data: { key: "pve_thresholds", value: "not-json" },
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/pve/thresholds"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { config: { cpu: number } };
    expect(body.config.cpu).toBe(80);
  });
});

describe("PUT /api/pve/thresholds", () => {
  test("updates a single threshold and keeps the others", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/pve/thresholds", { cpu: 75 }, "PUT"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      config: { cpu: number; memory: number; storage: number };
    };
    expect(body.config.cpu).toBe(75);
    expect(body.config.memory).toBe(80);
    expect(body.config.storage).toBe(80);
  });

  test("rejects thresholds below 1", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/pve/thresholds", { cpu: 0 }, "PUT"));
    expect(status(res)).toBe(400);
  });

  test("rejects thresholds above 100", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/pve/thresholds", { memory: 101 }, "PUT"));
    expect(status(res)).toBe(400);
  });

  test("rejects non-integer values", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/pve/thresholds", { storage: 50.5 }, "PUT"));
    expect(status(res)).toBe(400);
  });

  test("rejects invalid JSON body", async () => {
    const { PUT } = await loadRoute();
    const req = new (await import("next/server")).NextRequest(
      "http://localhost/api/pve/thresholds",
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
    await PUT(jsonRequest("/api/pve/thresholds", { cpu: 60 }, "PUT"));
    const res = await GET(getRequest("/api/pve/thresholds"));
    const body = (await jsonBody(res)) as { config: { cpu: number } };
    expect(body.config.cpu).toBe(60);
  });

  test("rejects an empty object", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/pve/thresholds", {}, "PUT"));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toMatch(/at least one threshold/i);
  });

  test("rejects unknown fields and unknown-only payloads", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(jsonRequest("/api/pve/thresholds", { disk: 70 }, "PUT"));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toMatch(/validation failed/i);
  });

  test("rejects a mix of valid and unknown fields", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest("/api/pve/thresholds", { cpu: 75, foo: 1 }, "PUT"),
    );
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toMatch(/validation failed/i);
  });
});
