/**
 * Unit tests for src/app/api/macros/[id]/commands/reorder/route.ts
 *
 * Reorders a macro's command array given a permutation of indices.
 * Verifies that:
 *  - the resulting array is in the requested order
 *  - 400 is returned when the order length does not match the command count
 *  - 400 is returned on validation failure
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest } from "@/test-utils/route-helpers";
import type { MacroCommand } from "@/types";

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

describe("POST /api/macros/[id]/commands/reorder", () => {
  test("reorders commands and re-numbers ord", async () => {
    const m = await testDB.db.macro.create({
      data: { name: "m", commands: JSON.stringify([{ ord: 0, cmd: "a" }, { ord: 1, cmd: "b" }, { ord: 2, cmd: "c" }]) },
    });
    const { POST } = await loadRoute("reorder-ok");
    // Reverse: [c, b, a]
    const res = await POST(jsonRequest(`/api/macros/${m.id}/commands/reorder`, { order: [2, 1, 0] }), paramsFor(m.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as MacroCommand[];
    expect(body.map((c) => c.cmd)).toEqual(["c", "b", "a"]);
    expect(body.map((c) => c.ord)).toEqual([0, 1, 2]);
  });

  test("returns 400 when order length does not match command count", async () => {
    const m = await testDB.db.macro.create({
      data: { name: "m", commands: JSON.stringify([{ ord: 0, cmd: "a" }, { ord: 1, cmd: "b" }]) },
    });
    const { POST } = await loadRoute("reorder-mismatch");
    const res = await POST(jsonRequest(`/api/macros/${m.id}/commands/reorder`, { order: [0] }), paramsFor(m.id));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid order array");
  });

  test("returns 400 on validation failure (negative order entry)", async () => {
    const m = await testDB.db.macro.create({
      data: { name: "m", commands: JSON.stringify([{ ord: 0, cmd: "a" }]) },
    });
    const { POST } = await loadRoute("reorder-bad");
    const res = await POST(jsonRequest(`/api/macros/${m.id}/commands/reorder`, { order: [-1] }), paramsFor(m.id));
    expect(res.status).toBe(400);
  });
});
