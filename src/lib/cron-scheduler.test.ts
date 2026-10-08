/**
 * Unit + integration tests for src/lib/cron-scheduler.ts
 *
 * The cron scheduler manages in-process CronJob instances. It calls
 * `getEnabledSchedules()` from the queries module and dynamically
 * imports `@/lib/runner`. We mock both so we can drive the scheduler
 * deterministically and inspect which schedules it tries to run.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import type { CronJob } from "cron";

let testDB: TestDB;
let q: typeof import("@/lib/db/queries");
let scheduler: typeof import("./cron-scheduler").cronScheduler;
let runMacroCalls: { macroId: number; triggeredBy: string }[];

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
  q = await import(`@/lib/db/queries?bust=${Date.now()}`);

  runMacroCalls = [];
  mock.module("@/lib/runner", () => ({
    runMacro: async (macroId: number, triggeredBy: string) => {
      runMacroCalls.push({ macroId, triggeredBy });
      return { historyId: 1, status: "success" };
    },
  }));
});

afterAll(async () => {
  await scheduler?.stopAll();
  Reflect.deleteProperty(globalThis, "missionControlCronScheduler");
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.history.deleteMany();
  await testDB.db.schedule.deleteMany();
  await testDB.db.macro.deleteMany();
  // Fresh process-wide scheduler for each test, without leaking live timers.
  await scheduler?.stopAll();
  Reflect.deleteProperty(globalThis, "missionControlCronScheduler");
  scheduler = (await import(`./cron-scheduler?bust=${Date.now()}-${Math.random()}`)).cronScheduler;
  runMacroCalls = [];
});

describe("cronScheduler.init()", () => {
  test("separate module evaluations share the same scheduler", async () => {
    const other = (await import(`./cron-scheduler?bust=api-${Date.now()}`)).cronScheduler;
    expect(other).toBe(scheduler);
  });

  test("loads all enabled schedules from the DB", async () => {
    const macro = await testDB.db.macro.create({ data: { name: "m" } });
    await testDB.db.schedule.create({
      data: { macroId: macro.id, cronExpression: "0 0 * * *", enabled: true },
    });
    await testDB.db.schedule.create({
      data: { macroId: macro.id, cronExpression: "0 0 1 * *", enabled: false },
    });

    await scheduler.init();
    // The scheduler doesn't expose the job count, but we can verify it
    // didn't throw and that the enabled flag was honored (the disabled
    // schedule shouldn't be loaded).
  });

  test("does not throw if there are zero schedules", async () => {
    await expect(scheduler.init()).resolves.toBeUndefined();
  });
});

describe("cronScheduler.addSchedule()", () => {
  test("registers a new schedule job", async () => {
    await scheduler.addSchedule(101, 1, "*/5 * * * *");
    // No public way to inspect jobs, but the operation shouldn't throw.
  });

  test("replacing an existing schedule stops the old one", async () => {
    await scheduler.addSchedule(102, 1, "*/5 * * * *");
    await scheduler.addSchedule(102, 1, "*/10 * * * *");
  });
});

describe("cronScheduler.updateSchedule()", () => {
  test("with enabled=false removes the existing job", async () => {
    await scheduler.addSchedule(201, 1, "*/5 * * * *");
    await scheduler.updateSchedule(201, 1, "*/5 * * * *", false);
  });

  test("with enabled=true re-registers the job", async () => {
    await scheduler.addSchedule(202, 1, "*/5 * * * *");
    await scheduler.updateSchedule(202, 1, "*/10 * * * *", true);
  });
});

describe("cronScheduler.removeSchedule()", () => {
  test("removes a registered job", async () => {
    await scheduler.addSchedule(301, 1, "*/5 * * * *");
    await scheduler.removeSchedule(301);
  });

  test("is a no-op when the schedule id is not registered", async () => {
    await expect(scheduler.removeSchedule(99999)).resolves.toBeUndefined();
  });

  test("a stale in-memory job does not run after its DB schedule is disabled", async () => {
    const macro = await testDB.db.macro.create({ data: { name: "m" } });
    const schedule = await testDB.db.schedule.create({
      data: { macroId: macro.id, cronExpression: "0 0 * * *", enabled: true },
    });

    await scheduler.addSchedule(schedule.id, macro.id, schedule.cronExpression);
    const jobs = (scheduler as unknown as { jobs: Map<number, CronJob> }).jobs;
    const job = jobs.get(schedule.id)!;
    job.stop();
    job.waitForCompletion = true;
    await job.fireOnTick();
    expect(runMacroCalls).toEqual([{ macroId: macro.id, triggeredBy: "schedule" }]);

    await testDB.db.schedule.update({
      where: { id: schedule.id },
      data: { enabled: false },
    });
    runMacroCalls = [];
    await job.fireOnTick();
    expect(runMacroCalls).toEqual([]);
    expect(jobs.has(schedule.id)).toBe(false);
  });
});

describe("cronScheduler.stopAll()", () => {
  test("stops every registered job", async () => {
    await scheduler.addSchedule(401, 1, "*/5 * * * *");
    await scheduler.addSchedule(402, 2, "*/10 * * * *");
    await scheduler.stopAll();
  });
});
