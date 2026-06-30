/**
 * Unit tests for src/app/api/macros/route.ts
 *
 * Tests the GET and POST handlers of the macros root endpoint.
 * Uses a real SQLite test DB via makeTestDB() and mock.module to
 * inject it as @/lib/db so the queries module uses it.
 *
 * Pattern: mock.module runs once in beforeAll, then each test
 * re-imports the route with a cache-buster query string to ensure
 * the route's modules pick up the mocked @/lib/db. To simulate a
 * DB failure we re-mock @/lib/db with a stub that throws, then
 * re-import the route again.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest, getRequest, jsonBody } from "@/test-utils/route-helpers";

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

describe("GET /api/macros", () => {
  test("returns an array including the auto-created Ungrouped group", async () => {
    const { GET } = await loadRoute("get-empty");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ group: { name: string }; macros: unknown[] }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((g) => g.group.name === "Ungrouped")).toBe(true);
  });

  test("groups macros by their groupName", async () => {
    await testDB.db.macroGroup.create({ data: { name: "Daily", ord: 0 } });
    await testDB.db.macro.create({ data: { name: "m1", groupName: "Daily", ord: 0 } });
    await testDB.db.macro.create({ data: { name: "m2", groupName: "Daily", ord: 1 } });
    await testDB.db.macro.create({ data: { name: "lone", groupName: "Ungrouped", ord: 0 } });

    const { GET } = await loadRoute("get-grouped");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ group: { name: string }; macros: { name: string }[] }>;
    const daily = body.find((g) => g.group.name === "Daily");
    expect(daily?.macros.map((m) => m.name)).toEqual(["m1", "m2"]);
  });

  test("returns 500 when the underlying DB throws", async () => {
    // Re-mock @/lib/db to return a stub that throws.
    const broken = {
      macroGroup: {
        findMany: () => Promise.reject(new Error("simulated DB failure")),
        create: () => Promise.resolve({}),
      },
      macro: { findMany: () => Promise.resolve([]), create: () => Promise.resolve({}) },
    };
    mock.module("@/lib/db", () => ({ db: broken }));
    const { GET } = await loadRoute("get-throws");
    const res = await GET();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to fetch macros");
    // Restore.
    mock.module("@/lib/db", () => ({ db: testDB.db }));
  });
});

describe("POST /api/macros", () => {
  test("creates a macro with the minimum required fields and returns 201", async () => {
    const { POST } = await loadRoute("post-min");
    const res = await POST(jsonRequest("/api/macros", { name: "fresh" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: number; name: string; description: string; groupName: string;
    };
    expect(body.id).toBeGreaterThan(0);
    expect(body.name).toBe("fresh");
    expect(body.description).toBe("");
    expect(body.groupName).toBe("Ungrouped");
  });

  test("accepts all optional fields and stores them", async () => {
    const { POST } = await loadRoute("post-full");
    const res = await POST(
      jsonRequest("/api/macros", {
        name: "deploy",
        description: "deploys the app",
        groupName: "Ops",
        ord: 5,
        runOnAgent: true,
        agentHostname: "box1",
        commands: '[{"ord":0,"cmd":"echo hi"}]',
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      description: string; groupName: string; ord: number;
      runOnAgent: boolean; agentHostname: string; commands: string;
    };
    expect(body.description).toBe("deploys the app");
    expect(body.groupName).toBe("Ops");
    expect(body.ord).toBe(5);
    expect(body.runOnAgent).toBe(true);
    expect(body.agentHostname).toBe("box1");
    expect(JSON.parse(body.commands)).toEqual([{ ord: 0, cmd: "echo hi" }]);
  });

  test("returns 400 with details on missing name", async () => {
    const { POST } = await loadRoute("post-noname");
    const res = await POST(jsonRequest("/api/macros", { description: "no name" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: unknown };
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  test("returns 400 on empty name (zod min(1))", async () => {
    const { POST } = await loadRoute("post-empty");
    const res = await POST(jsonRequest("/api/macros", { name: "" }));
    expect(res.status).toBe(400);
  });

  test("returns 500 when createMacro throws", async () => {
    // Override the mock to one whose macro.create throws.
    const broken = {
      macroGroup: {
        findMany: () => Promise.resolve([]),
        create: () => Promise.resolve({}),
      },
      macro: {
        findMany: () => Promise.resolve([]),
        create: () => Promise.reject(new Error("simulated insert failure")),
      },
    };
    mock.module("@/lib/db", () => ({ db: broken }));
    const { POST } = await loadRoute("post-throws");
    const res = await POST(jsonRequest("/api/macros", { name: "will-fail" }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to create macro");
    // Restore.
    mock.module("@/lib/db", () => ({ db: testDB.db }));
  });
});
