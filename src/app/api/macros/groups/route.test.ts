/**
 * Unit tests for src/app/api/macros/groups/route.ts
 *
 * Tests GET (list) and POST (create) for macro groups.
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

describe("GET /api/macros/groups", () => {
  test("returns an empty array when no groups exist", async () => {
    const { GET } = await loadRoute("get-empty");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("returns groups ordered by ord", async () => {
    await testDB.db.macroGroup.create({ data: { name: "Z", ord: 2 } });
    await testDB.db.macroGroup.create({ data: { name: "A", ord: 0 } });
    await testDB.db.macroGroup.create({ data: { name: "M", ord: 1 } });

    const { GET } = await loadRoute("get-ordered");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; ord: number }[];
    expect(body.map((g) => g.name)).toEqual(["A", "M", "Z"]);
  });

  test("returns 500 when the DB throws", async () => {
    const broken = {
      macroGroup: { findMany: () => Promise.reject(new Error("simulated")), create: () => Promise.resolve({}) },
    };
    mock.module("@/lib/db", () => ({ db: broken }));
    const { GET } = await loadRoute("get-500");
    const res = await GET();
    expect(res.status).toBe(500);
    mock.module("@/lib/db", () => ({ db: testDB.db }));
  });
});

describe("POST /api/macros/groups", () => {
  test("creates a group with a name and returns 201", async () => {
    const { POST } = await loadRoute("post-ok");
    const res = await POST(jsonRequest("/api/macros/groups", { name: "Deploy" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number; name: string; ord: number };
    expect(body.id).toBeGreaterThan(0);
    expect(body.name).toBe("Deploy");
  });

  test("accepts an explicit ord and stores it", async () => {
    const { POST } = await loadRoute("post-ord");
    const res = await POST(jsonRequest("/api/macros/groups", { name: "Beta", ord: 7 }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ord: number };
    expect(body.ord).toBe(7);
  });

  test("returns 400 on missing name", async () => {
    const { POST } = await loadRoute("post-noname");
    const res = await POST(jsonRequest("/api/macros/groups", {}));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: unknown };
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  test("returns 400 on empty name", async () => {
    const { POST } = await loadRoute("post-empty");
    const res = await POST(jsonRequest("/api/macros/groups", { name: "" }));
    expect(res.status).toBe(400);
  });

  test("returns 500 when createMacroGroup throws", async () => {
    const broken = {
      macroGroup: {
        findMany: () => Promise.resolve([]),
        count: () => Promise.reject(new Error("count failed")),
        create: () => Promise.reject(new Error("create failed")),
      },
    };
    mock.module("@/lib/db", () => ({ db: broken }));
    const { POST } = await loadRoute("post-500");
    const res = await POST(jsonRequest("/api/macros/groups", { name: "X" }));
    expect(res.status).toBe(500);
    mock.module("@/lib/db", () => ({ db: testDB.db }));
  });
});
