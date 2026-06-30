/**
 * Unit tests for src/app/api/macros/groups/[id]/route.ts
 *
 * Tests PUT (update) and DELETE for a single macro group.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest } from "@/test-utils/route-helpers";
import { captureConsoleError } from "@/test-utils/console";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.history.deleteMany();
  await testDB.db.schedule.deleteMany();
  await testDB.db.scrapeResult.deleteMany();
  await testDB.db.macro.deleteMany();
  await testDB.db.macroGroup.deleteMany();
  await testDB.db.setting.deleteMany();
  await testDB.db.config.deleteMany();
  await testDB.db.serverAgent.deleteMany();
  await testDB.db.nzbFile.deleteMany();
  await testDB.db.debridFile.deleteMany();
});

async function loadRoute(suffix: string) {
  return import(`./route.ts?bust=${Date.now()}-${suffix}`);
}

const paramsFor = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });

describe("PUT /api/macros/groups/[id]", () => {
  test("updates the group name and returns the new shape", async () => {
    const g = await testDB.db.macroGroup.create({ data: { name: "old", ord: 0 } });
    const { PUT } = await loadRoute("put-ok");
    const res = await PUT(jsonRequest(`/api/macros/groups/${g.id}`, { name: "new" }), paramsFor(g.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; ord: number };
    expect(body.name).toBe("new");
    expect(body.ord).toBe(0);
  });

  test("accepts a partial update (only ord)", async () => {
    const g = await testDB.db.macroGroup.create({ data: { name: "x", ord: 0 } });
    const { PUT } = await loadRoute("put-partial");
    const res = await PUT(jsonRequest(`/api/macros/groups/${g.id}`, { ord: 9 }), paramsFor(g.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; ord: number };
    expect(body.name).toBe("x");
    expect(body.ord).toBe(9);
  });

  test("returns 400 on validation failure (empty name)", async () => {
    const g = await testDB.db.macroGroup.create({ data: { name: "x" } });
    const { PUT } = await loadRoute("put-bad");
    const res = await PUT(jsonRequest(`/api/macros/groups/${g.id}`, { name: "" }), paramsFor(g.id));
    expect(res.status).toBe(400);
  });

  test("returns 500 when updateMacroGroup throws", async () => {
    const broken = {
      macroGroup: { update: () => Promise.reject(new Error("boom")) },
    };
    mock.module("@/lib/db", () => ({ db: broken }));
    const { PUT } = await loadRoute("put-500");
    const res = await PUT(jsonRequest("/api/macros/groups/1", { name: "x" }), paramsFor(1));
    expect(res.status).toBe(500);
    mock.module("@/lib/db", () => ({ db: testDB.db }));
  });
});

describe("DELETE /api/macros/groups/[id]", () => {
  test("deletes the group and returns { success: true }", async () => {
    const g = await testDB.db.macroGroup.create({ data: { name: "goner" } });
    const { DELETE } = await loadRoute("del-ok");
    const res = await DELETE(jsonRequest(`/api/macros/groups/${g.id}`, {}), paramsFor(g.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    const found = await testDB.db.macroGroup.findUnique({ where: { id: g.id } });
    expect(found).toBeNull();
  });

  test("returns 500 when delete throws (e.g. FK constraint from macros)", async () => {
    // The schema uses a loose `group_name TEXT` reference on macros,
    // not a real SQL FK to macro_groups — so a "real FK test" would
    // silently succeed. We mock the throw instead to verify that any
    // error from deleteMacroGroup is caught and returned as 500.
    const broken = {
      macroGroup: { delete: () => Promise.reject(new Error("FK constraint")) },
    };
    mock.module("@/lib/db", () => ({ db: broken }));
    const { DELETE } = await loadRoute("del-500");
    const res = await DELETE(jsonRequest("/api/macros/groups/1", {}), paramsFor(1));
    expect(res.status).toBe(500);
    mock.module("@/lib/db", () => ({ db: testDB.db }));
  });

  test("the 500 path still logs the error to console.error (preload silence doesn't swallow it)", async () => {
    // The preload silences console.error globally so noisy caught-error
    // logs don't pollute the reporter, but the production code path
    // must still call console.error. This test captures the log to
    // prove the handler is logging.
    const capture = captureConsoleError();
    try {
      const broken = {
        macroGroup: { delete: () => Promise.reject(new Error("simulated")) },
      };
      mock.module("@/lib/db", () => ({ db: broken }));
      const { DELETE } = await loadRoute("del-log");
      const res = await DELETE(jsonRequest("/api/macros/groups/1", {}), paramsFor(1));
      expect(res.status).toBe(500);
      expect(capture.logs).toHaveLength(1);
      expect(capture.logs[0]?.[0]).toBe("Failed to delete group:");
      const err = capture.logs[0]?.[1] as Error | undefined;
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe("simulated");
    } finally {
      capture.restore();
      mock.module("@/lib/db", () => ({ db: testDB.db }));
    }
  });
});
