/**
 * Unit tests for src/app/api/macros/reorder/route.ts
 *
 * This route uses db directly (not the queries module) because it
 * iterates over many updates. The mock must therefore expose
 * macroGroup.findUnique and macro.update.
 *
 * Behaviour:
 *  - Body has { groupId?, macroIds[] }
 *  - When groupId is provided and the group exists, the route uses
 *    that group's name for all listed macros
 *  - When groupId is omitted or the group is not found, groupName
 *    is "Ungrouped"
 *  - Each macro's ord is rewritten to its position in the array
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest } from "@/test-utils/route-helpers";

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

describe("POST /api/macros/reorder", () => {
  test("reorders macros within an existing group", async () => {
    const grp = await testDB.db.macroGroup.create({ data: { name: "Ops", ord: 0 } });
    const m1 = await testDB.db.macro.create({ data: { name: "m1", groupName: "Ops", ord: 0 } });
    const m2 = await testDB.db.macro.create({ data: { name: "m2", groupName: "Ops", ord: 1 } });
    const m3 = await testDB.db.macro.create({ data: { name: "m3", groupName: "Ops", ord: 2 } });

    const { POST } = await loadRoute("reorder-with-group");
    const res = await POST(jsonRequest("/api/macros/reorder", { groupId: grp.id, macroIds: [m3.id, m1.id, m2.id] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);

    const all = await testDB.db.macro.findMany({ orderBy: { ord: "asc" } });
    expect(all.map((m) => m.name)).toEqual(["m3", "m1", "m2"]);
    expect(all.every((m) => m.groupName === "Ops")).toBe(true);
  });

  test("defaults to 'Ungrouped' when groupId is omitted", async () => {
    const m1 = await testDB.db.macro.create({ data: { name: "m1", groupName: "Old" } });
    const m2 = await testDB.db.macro.create({ data: { name: "m2", groupName: "Old" } });

    const { POST } = await loadRoute("reorder-nogroup");
    const res = await POST(jsonRequest("/api/macros/reorder", { macroIds: [m2.id, m1.id] }));
    expect(res.status).toBe(200);

    const all = await testDB.db.macro.findMany({ orderBy: { ord: "asc" } });
    expect(all.every((m) => m.groupName === "Ungrouped")).toBe(true);
    expect(all.map((m) => m.name)).toEqual(["m2", "m1"]);
  });

  test("falls back to 'Ungrouped' when the groupId is not found", async () => {
    const m1 = await testDB.db.macro.create({ data: { name: "m1", groupName: "X" } });
    const { POST } = await loadRoute("reorder-missing-group");
    const res = await POST(jsonRequest("/api/macros/reorder", { groupId: 99999, macroIds: [m1.id] }));
    expect(res.status).toBe(200);
    const after = await testDB.db.macro.findUnique({ where: { id: m1.id } });
    expect(after?.groupName).toBe("Ungrouped");
  });

  test("accepts an empty macroIds array (z.array allows empty by default)", async () => {
    // Documenting actual behaviour: the schema is `z.array(z.number().int().positive())`
    // without `.min(1)`, so an empty array passes validation. The handler
    // then iterates zero times and returns success.
    const { POST } = await loadRoute("reorder-empty");
    const res = await POST(jsonRequest("/api/macros/reorder", { macroIds: [] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  test("returns 400 on negative groupId", async () => {
    const { POST } = await loadRoute("reorder-neg-groupid");
    const res = await POST(jsonRequest("/api/macros/reorder", { groupId: -1, macroIds: [1] }));
    expect(res.status).toBe(400);
  });

  test("returns 400 on negative macroId entry", async () => {
    const { POST } = await loadRoute("reorder-neg-macroid");
    const res = await POST(jsonRequest("/api/macros/reorder", { macroIds: [1, -1] }));
    expect(res.status).toBe(400);
  });
});
