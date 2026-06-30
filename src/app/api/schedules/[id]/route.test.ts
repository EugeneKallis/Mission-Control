/**
 * Unit tests for /api/schedules/[id] (GET + PUT + DELETE)
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
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;
let updateScheduleMock: ReturnType<typeof mock>;
let removeScheduleMock: ReturnType<typeof mock>;
let seededMacroId: number;
let seededScheduleId: number;

const mockScheduler = {
  addSchedule: (..._args: unknown[]) => {},
  updateSchedule: (...args: unknown[]) => updateScheduleMock(...args),
  removeSchedule: (...args: unknown[]) => removeScheduleMock(...args),
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
  updateScheduleMock = mock(async () => {});
  removeScheduleMock = mock(async () => {});
  mockScheduler.addSchedule = (..._a: unknown[]) => {};
  mockScheduler.updateSchedule = updateScheduleMock;
  mockScheduler.removeSchedule = removeScheduleMock;

  await testDB.db.history.deleteMany();
  await testDB.db.schedule.deleteMany();
  await testDB.db.macro.deleteMany();
  await testDB.db.macroGroup.deleteMany();

  const macro = await testDB.db.macro.create({
    data: { name: "Test Macro" },
  });
  seededMacroId = macro.id;
  const schedule = await testDB.db.schedule.create({
    data: {
      macroId: seededMacroId,
      cronExpression: "*/5 * * * *",
      enabled: true,
    },
  });
  seededScheduleId = schedule.id;
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

const idParam = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

// ── GET /api/schedules/[id] ─────────────────────────────────────────────

describe("GET /api/schedules/[id]", () => {
  test("returns 200 with the schedule on happy path", async () => {
    const { GET } = await loadRoute();
    const res = await GET({} as never, idParam(seededScheduleId));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      id: number;
      macroId: number;
      cronExpression: string;
      enabled: boolean;
    };
    expect(body.id).toBe(seededScheduleId);
    expect(body.macroId).toBe(seededMacroId);
    expect(body.cronExpression).toBe("*/5 * * * *");
    expect(body.enabled).toBe(true);
  });

  test("returns 404 when the schedule does not exist", async () => {
    const { GET } = await loadRoute();
    const res = await GET({} as never, idParam(999_999));
    expect(status(res)).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Schedule not found" });
  });
});

// ── PUT /api/schedules/[id] ─────────────────────────────────────────────

describe("PUT /api/schedules/[id]", () => {
  test("returns 400 on invalid JSON body", async () => {
    const { PUT } = await loadRoute();
    const req = new Request(`http://localhost/api/schedules/${seededScheduleId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    const res = await PUT(req as never, idParam(seededScheduleId));
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid JSON body" });
  });

  test("returns 400 on validation failure", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest(`/api/schedules/${seededScheduleId}`, {
        cronExpression: "",
      }, "PUT"),
      idParam(seededScheduleId),
    );
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 200 with updated cronExpression on happy path", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest(
        `/api/schedules/${seededScheduleId}`,
        { cronExpression: "0 9 * * *" },
        "PUT",
      ),
      idParam(seededScheduleId),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { cronExpression: string };
    expect(body.cronExpression).toBe("0 9 * * *");
  });

  test("syncs with cronScheduler on update", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest(
        `/api/schedules/${seededScheduleId}`,
        { enabled: false },
        "PUT",
      ),
      idParam(seededScheduleId),
    );
    expect(status(res)).toBe(200);
    expect(updateScheduleMock).toHaveBeenCalledTimes(1);
    expect(updateScheduleMock.mock.calls[0]?.[0]).toBe(seededScheduleId);
  });

  test("returns 404 when the schedule does not exist", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(
      jsonRequest(
        "/api/schedules/999999",
        { cronExpression: "0 9 * * *" },
        "PUT",
      ),
      idParam(999_999),
    );
    expect(status(res)).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Schedule not found" });
  });
});

// ── DELETE /api/schedules/[id] ──────────────────────────────────────────

describe("DELETE /api/schedules/[id]", () => {
  test("returns 200 with success on happy path", async () => {
    const { DELETE } = await loadRoute();
    const res = await DELETE({} as never, idParam(seededScheduleId));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
  });

  test("removes the schedule from cronScheduler on delete", async () => {
    const { DELETE } = await loadRoute();
    await DELETE({} as never, idParam(seededScheduleId));
    expect(removeScheduleMock).toHaveBeenCalledTimes(1);
    expect(removeScheduleMock.mock.calls[0]?.[0]).toBe(seededScheduleId);
  });

  test("actually deletes the row from the DB", async () => {
    const { DELETE } = await loadRoute();
    await DELETE({} as never, idParam(seededScheduleId));
    const after = await testDB.db.schedule.findUnique({
      where: { id: seededScheduleId },
    });
    expect(after).toBeNull();
  });

  test("returns 500 when delete fails (nonexistent id)", async () => {
    const { DELETE } = await loadRoute();
    const res = await DELETE({} as never, idParam(999_999));
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to delete schedule" });
  });
});
