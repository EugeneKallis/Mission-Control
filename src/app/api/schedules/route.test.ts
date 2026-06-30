/**
 * Unit tests for /api/schedules (GET + POST)
 *
 * Strategy: same as src/lib/db/queries.test.ts — spin up a temp-file
 * Prisma client, mock @/lib/db, mock @/lib/cron-scheduler, and re-import
 * the route module with a cache-busting query string so the mocks
 * take effect.
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
import { getRequest, jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;
let addScheduleMock: ReturnType<typeof mock>;
let seededMacroId: number;

const mockScheduler = {
  addSchedule: (..._args: unknown[]) => addScheduleMock(..._args),
  updateSchedule: (..._args: unknown[]) => addScheduleMock(..._args),
  removeSchedule: (..._args: unknown[]) => addScheduleMock(..._args),
};

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
  mock.module("@/lib/cron-scheduler", () => ({ cronScheduler: mockScheduler }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  addScheduleMock = mock(async () => {});
  mockScheduler.addSchedule = addScheduleMock;
  mockScheduler.updateSchedule = addScheduleMock;
  mockScheduler.removeSchedule = addScheduleMock;

  await testDB.db.history.deleteMany();
  await testDB.db.schedule.deleteMany();
  await testDB.db.macro.deleteMany();
  await testDB.db.macroGroup.deleteMany();

  // Seed a macro that schedules can reference (FK constraint).
  const macro = await testDB.db.macro.create({
    data: { name: "Test Macro" },
  });
  seededMacroId = macro.id;
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── GET /api/schedules ──────────────────────────────────────────────────

describe("GET /api/schedules", () => {
  test("returns 200 and an empty array when no schedules exist", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual([]);
  });

  test("returns 200 with schedules including the macro name", async () => {
    await testDB.db.schedule.create({
      data: {
        macroId: seededMacroId,
        cronExpression: "*/5 * * * *",
        enabled: true,
      },
    });
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Array<{
      id: number;
      macroId: number;
      cronExpression: string;
      macro: { name: string };
    }>;
    expect(body).toHaveLength(1);
    expect(body[0].macroId).toBe(seededMacroId);
    expect(body[0].cronExpression).toBe("*/5 * * * *");
    expect(body[0].macro.name).toBe("Test Macro");
  });

  test("returns 500 when the DB throws", async () => {
    // Override the @/lib/db/queries mock to simulate a failure
    // (this takes precedence over the real Prisma mock).
    mock.module("@/lib/db/queries", () => ({
      listSchedules: async () => {
        throw new Error("DB unavailable");
      },
    }));
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to list schedules" });
  });
});

// ── POST /api/schedules ─────────────────────────────────────────────────

describe("POST /api/schedules", () => {
  test("returns 400 on invalid JSON body", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/schedules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req as never);
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid JSON body" });
  });

  test("returns 400 on validation failure (missing fields)", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/schedules", {}));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string; details: unknown };
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  test("returns 400 on non-positive macroId", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/schedules", {
      macroId: 0,
      cronExpression: "* * * * *",
    }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 on empty cronExpression", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/schedules", {
      macroId: seededMacroId,
      cronExpression: "",
    }));
    expect(status(res)).toBe(400);
  });

  test("returns 201 with the new schedule on happy path", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/schedules", {
      macroId: seededMacroId,
      cronExpression: "0 * * * *",
    }));
    expect(status(res)).toBe(201);
    const body = (await jsonBody(res)) as {
      id: number;
      macroId: number;
      cronExpression: string;
      enabled: boolean;
    };
    expect(body.id).toBeGreaterThan(0);
    expect(body.macroId).toBe(seededMacroId);
    expect(body.cronExpression).toBe("0 * * * *");
    expect(body.enabled).toBe(true);
  });

  test("registers the schedule with cronScheduler when enabled", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/schedules", {
      macroId: seededMacroId,
      cronExpression: "*/10 * * * *",
      enabled: true,
    }));
    const body = (await jsonBody(res)) as { id: number };
    expect(addScheduleMock).toHaveBeenCalledTimes(1);
    expect(addScheduleMock.mock.calls[0]).toEqual([
      body.id,
      seededMacroId,
      "*/10 * * * *",
    ]);
  });

  test("does NOT register with cronScheduler when enabled=false", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/schedules", {
      macroId: seededMacroId,
      cronExpression: "*/10 * * * *",
      enabled: false,
    }));
    expect(status(res)).toBe(201);
    expect(addScheduleMock).not.toHaveBeenCalled();
  });

  test("returns 500 on create failure", async () => {
    mock.module("@/lib/db/queries", () => ({
      createSchedule: async () => {
        throw new Error("DB write failed");
      },
    }));
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/schedules", {
      macroId: seededMacroId,
      cronExpression: "*/10 * * * *",
    }));
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to create schedule" });
  });
});
