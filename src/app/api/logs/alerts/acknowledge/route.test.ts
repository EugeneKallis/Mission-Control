/**
 * Unit tests for POST /api/logs/alerts/acknowledge
 *
 * Verifies that the endpoint returns { ok: true } and that the
 * acknowledged-at watermark is persisted in the DB.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  afterAll,
} from "bun:test";
import {
  getRequest,
  jsonBody,
  status,
  jsonRequest,
} from "@/test-utils/route-helpers";
import type { PrismaClient } from "@prisma/client";
import { makeTestDB } from "@/lib/db/test-helpers";

let testDB: { db: PrismaClient; cleanup: () => Promise<void> };

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("POST /api/logs/alerts/acknowledge", () => {
  test("returns 200 with { ok: true }", async () => {
    const { POST } = await loadRoute();
    const req = jsonRequest("http://localhost/api/logs/alerts/acknowledge", {});
    const res = await POST(req);
    expect(status(res)).toBe(200);
    const body = await jsonBody(res);
    expect(body).toHaveProperty("ok", true);
    expect(body).toHaveProperty("acknowledgedAt");
    expect(typeof body.acknowledgedAt).toBe("number");
  });

  test("sets the acknowledged-at watermark to a recent timestamp", async () => {
    const before = Date.now() - 100;

    const { POST } = await loadRoute();
    const req = jsonRequest("http://localhost/api/logs/alerts/acknowledge", {});
    await POST(req);

    // Read back via the lib
    const { getAcknowledgedAt } = await import(
      `@/lib/log-alerts?bust=${Date.now()}-${Math.random()}`
    );
    const value = await getAcknowledgedAt();
    expect(value).toBeGreaterThan(before);
    expect(value).toBeLessThanOrEqual(Date.now() + 100);
  });

  test("can be called multiple times — each call updates the watermark", async () => {
    const { POST } = await loadRoute();
    const { getAcknowledgedAt } = await import(
      `@/lib/log-alerts?bust=${Date.now()}-${Math.random()}`
    );

    const req1 = jsonRequest("http://localhost/api/logs/alerts/acknowledge", {});
    await POST(req1);
    const v1 = await getAcknowledgedAt();
    await new Promise((r) => setTimeout(r, 10));

    const req2 = jsonRequest("http://localhost/api/logs/alerts/acknowledge", {});
    await POST(req2);
    const v2 = await getAcknowledgedAt();
    expect(v2).toBeGreaterThan(v1 as number);
  });
});
