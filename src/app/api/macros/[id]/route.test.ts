/**
 * Unit tests for src/app/api/macros/[id]/route.ts
 *
 * Tests the GET / PUT / DELETE handlers for a single macro.
 * The GET handler maps Prisma's "Record to findUniqueOrThrow" / "not found"
 * errors to a 404. PUT validates with zod. DELETE just deletes.
 *
 * Note: params is a Promise in Next.js 15+ App Router; the route awaits it.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest, jsonBody } from "@/test-utils/route-helpers";

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

describe("GET /api/macros/[id]", () => {
  test("returns the macro for a valid id", async () => {
    const macro = await testDB.db.macro.create({ data: { name: "thing" } });
    const { GET } = await loadRoute("get-ok");
    const res = await GET(jsonRequest(`/api/macros/${macro.id}`, {}), paramsFor(macro.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: number; name: string };
    expect(body.id).toBe(macro.id);
    expect(body.name).toBe("thing");
  });

  test("returns 404 when the macro does not exist", async () => {
    const { GET } = await loadRoute("get-404");
    const res = await GET(jsonRequest("/api/macros/99999", {}), paramsFor(99999));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Macro not found");
  });

  test("returns 500 on other DB errors", async () => {
    const broken = {
      macro: {
        findUniqueOrThrow: () => Promise.reject(new Error("connection reset")),
        update: () => Promise.resolve({}),
        delete: () => Promise.resolve(undefined),
      },
    };
    mock.module("@/lib/db", () => ({ db: broken }));
    const { GET } = await loadRoute("get-500");
    const res = await GET(jsonRequest("/api/macros/1", {}), paramsFor(1));
    expect(res.status).toBe(500);
    mock.module("@/lib/db", () => ({ db: testDB.db }));
  });
});

describe("PUT /api/macros/[id]", () => {
  test("updates the macro and returns the new shape", async () => {
    const macro = await testDB.db.macro.create({ data: { name: "old", description: "d" } });
    const { PUT } = await loadRoute("put-ok");
    const res = await PUT(jsonRequest(`/api/macros/${macro.id}`, { name: "new", description: "d2" }), paramsFor(macro.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; description: string };
    expect(body.name).toBe("new");
    expect(body.description).toBe("d2");
  });

  test("accepts a partial update (only one field)", async () => {
    const macro = await testDB.db.macro.create({ data: { name: "x", description: "orig" } });
    const { PUT } = await loadRoute("put-partial");
    const res = await PUT(jsonRequest(`/api/macros/${macro.id}`, { description: "only" }), paramsFor(macro.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; description: string };
    expect(body.name).toBe("x");
    expect(body.description).toBe("only");
  });

  test("returns 400 on validation failure (e.g. name too short)", async () => {
    const macro = await testDB.db.macro.create({ data: { name: "x" } });
    const { PUT } = await loadRoute("put-bad");
    const res = await PUT(jsonRequest(`/api/macros/${macro.id}`, { name: "" }), paramsFor(macro.id));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: unknown };
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  test("returns 500 on DB error", async () => {
    const broken = {
      macro: {
        findUniqueOrThrow: () => Promise.resolve({ id: 1, commands: "[]" }),
        update: () => Promise.reject(new Error("boom")),
        delete: () => Promise.resolve(undefined),
      },
    };
    mock.module("@/lib/db", () => ({ db: broken }));
    const { PUT } = await loadRoute("put-500");
    const res = await PUT(jsonRequest("/api/macros/1", { name: "x" }), paramsFor(1));
    expect(res.status).toBe(500);
    mock.module("@/lib/db", () => ({ db: testDB.db }));
  });
});

describe("DELETE /api/macros/[id]", () => {
  test("deletes the macro and returns { success: true }", async () => {
    const macro = await testDB.db.macro.create({ data: { name: "goner" } });
    const { DELETE } = await loadRoute("del-ok");
    const res = await DELETE(jsonRequest(`/api/macros/${macro.id}`, {}), paramsFor(macro.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    // Verify it's gone
    const found = await testDB.db.macro.findUnique({ where: { id: macro.id } });
    expect(found).toBeNull();
  });

  test("returns 500 when delete fails (e.g. FK constraint)", async () => {
    const broken = {
      macro: {
        findUniqueOrThrow: () => Promise.resolve({ id: 1 }),
        update: () => Promise.resolve({}),
        delete: () => Promise.reject(new Error("FK constraint")),
      },
    };
    mock.module("@/lib/db", () => ({ db: broken }));
    const { DELETE } = await loadRoute("del-500");
    const res = await DELETE(jsonRequest("/api/macros/1", {}), paramsFor(1));
    expect(res.status).toBe(500);
    mock.module("@/lib/db", () => ({ db: testDB.db }));
  });
});
