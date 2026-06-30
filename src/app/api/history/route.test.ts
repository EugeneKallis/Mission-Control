/**
 * Unit tests for /api/history (GET + DELETE)
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
import { getRequest, deleteRequest, jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;
let seededMacroId: number;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.history.deleteMany();
  await testDB.db.macro.deleteMany();
  await testDB.db.macroGroup.deleteMany();
  const macro = await testDB.db.macro.create({ data: { name: "M" } });
  seededMacroId = macro.id;
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── GET /api/history ──────────────────────────────────────────────────────

describe("GET /api/history", () => {
  test("returns 200 with an empty array when no history exists", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual([]);
  });

  test("returns 200 with history rows including macro name", async () => {
    await testDB.db.history.create({
      data: {
        macroId: seededMacroId,
        startTime: new Date(),
        status: "completed",
        triggeredBy: "user",
      },
    });
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Array<{
      macroId: number;
      status: string;
      macro: { name: string };
    }>;
    expect(body).toHaveLength(1);
    expect(body[0].macroId).toBe(seededMacroId);
    expect(body[0].status).toBe("completed");
    expect(body[0].macro.name).toBe("M");
  });

  test("returns 500 when getHistory throws", async () => {
    mock.module("@/lib/db/queries", () => ({
      getHistory: async () => {
        throw new Error("DB unavailable");
      },
    }));
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to fetch history" });
  });
});

// ── DELETE /api/history ───────────────────────────────────────────────────

describe("DELETE /api/history", () => {
  test("returns 200 with success on empty history", async () => {
    const { DELETE } = await loadRoute();
    const res = await DELETE();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
  });

  test("removes all history rows and returns success", async () => {
    await testDB.db.history.create({
      data: {
        macroId: seededMacroId,
        startTime: new Date(),
        status: "completed",
        triggeredBy: "user",
      },
    });
    await testDB.db.history.create({
      data: {
        macroId: seededMacroId,
        startTime: new Date(),
        status: "failed",
        triggeredBy: "user",
      },
    });
    const { DELETE } = await loadRoute();
    const res = await DELETE();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
    const remaining = await testDB.db.history.count();
    expect(remaining).toBe(0);
  });

  test("returns 500 when deleteAllHistory throws", async () => {
    mock.module("@/lib/db/queries", () => ({
      deleteAllHistory: async () => {
        throw new Error("DB write failed");
      },
    }));
    const { DELETE } = await loadRoute();
    const res = await DELETE();
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to clear history" });
  });
});
