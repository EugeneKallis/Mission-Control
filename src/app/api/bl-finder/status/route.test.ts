/**
 * Unit tests for GET /api/bl-finder/status
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
import { getRequest, jsonBody, status } from "@/test-utils/route-helpers";

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

describe("GET /api/bl-finder/status", () => {
  test("returns the default status when no row exists", async () => {
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/bl-finder/status"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { running: boolean; processed: number };
    expect(body.running).toBe(false);
    expect(body.processed).toBe(0);
  });

  test("returns the stored status when present", async () => {
    const stored = {
      running: false,
      setAt: Date.now(),
      lastPassAt: Date.now() - 1000,
      processed: 5,
      ok: 4,
      broken: 1,
      error: null,
    };
    await testDB.db.setting.create({
      data: { key: "blfinder_status", value: JSON.stringify(stored) },
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/bl-finder/status"));
    const body = (await jsonBody(res)) as { processed: number; ok: number; broken: number };
    expect(body.processed).toBe(5);
    expect(body.ok).toBe(4);
    expect(body.broken).toBe(1);
  });

  test("clears a stale 'running' flag", async () => {
    const stale = {
      running: true,
      setAt: Date.now() - 10 * 60 * 1000, // 10 min ago, > 5 min stale threshold
      lastPassAt: null,
      processed: 0,
      ok: 0,
      broken: 0,
      error: null,
    };
    await testDB.db.setting.create({
      data: { key: "blfinder_status", value: JSON.stringify(stale) },
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/bl-finder/status"));
    const body = (await jsonBody(res)) as { running: boolean };
    expect(body.running).toBe(false);
  });
});
