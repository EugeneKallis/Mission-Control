/**
 * Unit tests for /api/history/[id] (GET)
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
import { jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;
let seededMacroId: number;
let seededHistoryId: number;

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
  const macro = await testDB.db.macro.create({ data: { name: "HM" } });
  seededMacroId = macro.id;
  const history = await testDB.db.history.create({
    data: {
      macroId: seededMacroId,
      startTime: new Date(),
      status: "completed",
      triggeredBy: "user",
      output: "some output",
    },
  });
  seededHistoryId = history.id;
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── GET /api/history/[id] ─────────────────────────────────────────────────

describe("GET /api/history/[id]", () => {
  test("returns 200 with the history item including macro name and output", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/history/1"), {
      params: Promise.resolve({ id: String(seededHistoryId) }),
    });
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      id: number;
      macroId: number;
      output: string;
      status: string;
      macro: { name: string };
    };
    expect(body.id).toBe(seededHistoryId);
    expect(body.macroId).toBe(seededMacroId);
    expect(body.output).toBe("some output");
    expect(body.status).toBe("completed");
    expect(body.macro.name).toBe("HM");
  });

  test("returns 404 when the history item does not exist", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/history/99999"), {
      params: Promise.resolve({ id: "99999" }),
    });
    expect(status(res)).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "History item not found" });
  });

  test("accepts a non-numeric id by passing it through Number() (NaN -> 404)", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/history/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(status(res)).toBe(404);
  });
});
