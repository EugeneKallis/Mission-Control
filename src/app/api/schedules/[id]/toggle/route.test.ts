/**
 * Unit tests for /api/schedules/[id]/toggle (POST)
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
import { status, jsonBody } from "@/test-utils/route-helpers";

let testDB: TestDB;
let addScheduleMock: ReturnType<typeof mock>;
let removeScheduleMock: ReturnType<typeof mock>;
let seededMacroId: number;
let seededScheduleId: number;

const mockScheduler = {
  addSchedule: (...args: unknown[]) => addScheduleMock(...args),
  updateSchedule: (..._args: unknown[]) => {},
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
  addScheduleMock = mock(async () => {});
  removeScheduleMock = mock(async () => {});
  mockScheduler.addSchedule = addScheduleMock;
  mockScheduler.updateSchedule = (..._a: unknown[]) => {};
  mockScheduler.removeSchedule = removeScheduleMock;

  await testDB.db.history.deleteMany();
  await testDB.db.schedule.deleteMany();
  await testDB.db.macro.deleteMany();
  await testDB.db.macroGroup.deleteMany();

  const macro = await testDB.db.macro.create({
    data: { name: "Test Macro" },
  });
  seededMacroId = macro.id;
  // Start enabled.
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

describe("POST /api/schedules/[id]/toggle", () => {
  test("returns 400 on non-numeric ID", async () => {
    const { POST } = await loadRoute();
    const res = await POST({} as never, idParam(0));
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid schedule ID" });
  });

  test("returns 400 on negative ID", async () => {
    const { POST } = await loadRoute();
    const res = await POST({} as never, idParam(-1));
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid schedule ID" });
  });

  test("toggles an enabled schedule to disabled and removes from scheduler", async () => {
    const { POST } = await loadRoute();
    const res = await POST({} as never, idParam(seededScheduleId));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      success: boolean;
      id: number;
      enabled: boolean;
      macro_id: number;
      cron_expression: string;
    };
    expect(body.success).toBe(true);
    expect(body.id).toBe(seededScheduleId);
    expect(body.enabled).toBe(false);
    expect(body.macro_id).toBe(seededMacroId);
    expect(body.cron_expression).toBe("*/5 * * * *");
    expect(removeScheduleMock).toHaveBeenCalledWith(seededScheduleId);
    expect(addScheduleMock).not.toHaveBeenCalled();
  });

  test("toggles a disabled schedule to enabled and adds to scheduler", async () => {
    // Flip to disabled first.
    await testDB.db.schedule.update({
      where: { id: seededScheduleId },
      data: { enabled: false },
    });
    addScheduleMock.mockClear();
    removeScheduleMock.mockClear();

    const { POST } = await loadRoute();
    const res = await POST({} as never, idParam(seededScheduleId));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { enabled: boolean };
    expect(body.enabled).toBe(true);
    expect(addScheduleMock).toHaveBeenCalledTimes(1);
    expect(addScheduleMock.mock.calls[0]).toEqual([
      seededScheduleId,
      seededMacroId,
      "*/5 * * * *",
    ]);
    expect(removeScheduleMock).not.toHaveBeenCalled();
  });

  test("persists the toggle in the database", async () => {
    const { POST } = await loadRoute();
    await POST({} as never, idParam(seededScheduleId));
    const after = await testDB.db.schedule.findUnique({
      where: { id: seededScheduleId },
    });
    expect(after?.enabled).toBe(false);
  });

  test("returns 404 when the schedule does not exist", async () => {
    const { POST } = await loadRoute();
    const res = await POST({} as never, idParam(999_999));
    expect(status(res)).toBe(404);
    expect(await jsonBody(res)).toEqual({ error: "Schedule not found" });
  });
});
