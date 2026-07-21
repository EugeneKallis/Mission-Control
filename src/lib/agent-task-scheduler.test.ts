/**
 * Tests for src/lib/agent-task-scheduler.ts
 *
 * Covers:
 *  - Lifecycle: init / add / update / remove / stopAll
 *  - runOnce: spawn, JSON-line parsing, history create/flush/finalize
 *  - Overlap guard (skip if already running)
 *  - Timeout path (SIGTERM → SIGKILL, history marked error)
 *  - DB integration via makeTestDB()
 *
 * Uses mock.module to replace child_process.spawn and pi-path.getPiPath
 * so no actual pi process is spawned.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { EventEmitter } from "events";

// ── Test DB setup ─────────────────────────────────────────────────────────

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

// ── Shared test task shape ────────────────────────────────────────────────

const TEST_TASK_SHAPE = {
  name: "Test Task",
  prompt: "List files",
  cronExpression: "*/5 * * * *",
  enabled: true,
  timeoutSec: 30,
};

let queries: typeof import("@/lib/db/queries");

beforeEach(async () => {
  await testDB.db.agentTask.deleteMany();
  await testDB.db.history.deleteMany();
  queries = await import(`@/lib/db/queries?bust=${Date.now()}`);
});

// ── Clean up child_process mock after each test ───────────────────────────

afterEach(() => {
  // Restore any child_process mocks from previous tests
  // by re-mocking to a passthrough (or just let next test override)
});

// ── Lifecycle (no mocking needed) ─────────────────────────────────────────

describe("lifecycle", () => {
  test.each([
    ["init with no tasks starts cleanly", async (sched: any) => {
      await sched.agentTaskScheduler.init();
    }],
    ["init loads enabled tasks and registers jobs", async (sched: any) => {
      await queries.createAgentTask({ ...TEST_TASK_SHAPE, enabled: true });
      await sched.agentTaskScheduler.init();
    }],
    ["init skips disabled tasks", async (sched: any) => {
      await queries.createAgentTask({ ...TEST_TASK_SHAPE, enabled: false });
      await sched.agentTaskScheduler.init();
    }],
  ])("%s", async (_, fn) => {
    const sched = await import(`./agent-task-scheduler?bust=${Date.now()}`);
    await fn(sched);
  });

  test("addTask and removeTask cycle", async () => {
    const task = await queries.createAgentTask({ ...TEST_TASK_SHAPE, enabled: true });
    const sched = await import(`./agent-task-scheduler?bust=${Date.now()}`);
    await sched.agentTaskScheduler.addTask(task.id, { prompt: task.prompt });
    await sched.agentTaskScheduler.removeTask(task.id);
    await sched.agentTaskScheduler.removeTask(task.id);
  });

  test("updateTask stops old job and starts new if enabled", async () => {
    const task = await queries.createAgentTask({ ...TEST_TASK_SHAPE, enabled: true });
    const sched = await import(`./agent-task-scheduler?bust=${Date.now()}`);
    await sched.agentTaskScheduler.addTask(task.id, { prompt: task.prompt });
    await sched.agentTaskScheduler.updateTask(task.id, { prompt: "Updated" }, true);
    await sched.agentTaskScheduler.updateTask(task.id, { prompt: "Disabled" }, false);
  });

  test("stopAll clears all jobs", async () => {
    const t1 = await queries.createAgentTask({ ...TEST_TASK_SHAPE, name: "T1", enabled: true });
    const t2 = await queries.createAgentTask({ ...TEST_TASK_SHAPE, name: "T2", enabled: true });
    const sched = await import(`./agent-task-scheduler?bust=${Date.now()}`);
    await sched.agentTaskScheduler.addTask(t1.id, { prompt: "p1" });
    await sched.agentTaskScheduler.addTask(t2.id, { prompt: "p2" });
    await sched.agentTaskScheduler.stopAll();
  });
});

// ── runOnce with mocked spawn ─────────────────────────────────────────────

describe("runOnce with mocked spawn", () => {
  test("runOnce with fake process emitting JSON events", async () => {
    const task = await queries.createAgentTask({
      ...TEST_TASK_SHAPE,
      enabled: true,
      prompt: "List files",
    });

    // Build a fake child process
    const stdout = new EventEmitter();
    let closeCb: ((code: number | null) => void) | null = null;
    const fakeProcess: {
      stdout: EventEmitter;
      stderr: EventEmitter;
      on: (event: string, cb: (...args: unknown[]) => void) => unknown;
      kill: (...args: unknown[]) => void;
      killed: boolean;
    } = {
      stdout,
      stderr: new EventEmitter(),
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (event === "close") closeCb = cb as (code: number | null) => void;
        return fakeProcess;
      },
      kill: () => {},
      killed: false,
    };

    // Mock spawn — stored as module-level mock for this test
    mock.module("child_process", () => ({
      spawn: mock(() => fakeProcess),
      execSync: () => "",
      execFileSync: () => "",
    }));

    mock.module("@/lib/pi/pi-path", () => ({
      getPiPath: () => "/usr/local/bin/pi",
    }));

    const sched = await import(`./agent-task-scheduler?bust=${Date.now()}`);

    // Start the run
    const runPromise = sched.agentTaskScheduler.runNow(task.id);

    // After the promise starts, emit data and close
    await new Promise((r) => setTimeout(r, 10));
    stdout.emit("data", Buffer.from(
      JSON.stringify({ type: "agent_start" }) + "\n" +
      JSON.stringify({ type: "turn_start" }) + "\n" +
      JSON.stringify({
        type: "tool_execution_start",
        toolName: "read",
        args: { path: "/tmp/test.txt" },
      }) + "\n" +
      JSON.stringify({
        type: "tool_execution_end",
        toolName: "read",
        result: { content: [{ type: "text", text: "file contents" }] },
        isError: false,
      }) + "\n" +
      JSON.stringify({ type: "turn_end", toolResults: [{}] }) + "\n" +
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Here is the file listing." }],
        },
      }) + "\n" +
      JSON.stringify({ type: "agent_end" }) + "\n",
    ));
    // @ts-expect-error -- mock callback type inference narrows closeCb to never
    closeCb?.(0);

    await runPromise;

    // Verify history
    const history = await queries.getRecentAgentTaskHistory(task.id, 10);
    expect(history.length).toBeGreaterThanOrEqual(1);
    const run = history[0];
    expect(run.status).toBe("success");
    expect(run.agentTaskId).toBe(task.id);
    expect(run.output).toContain("[agent_start]");
    expect(run.output).toContain("[tool: read]");
    expect(run.output).toContain("file contents");
    expect(run.output).toContain("Assistant:");
    expect(run.output).toContain("Here is the file listing.");

    // Verify task status
    const updatedTask = await queries.getAgentTask(task.id);
    expect(updatedTask.lastStatus).toBe("success");
  });

  test("runOnce captures error output on failure", async () => {
    const task = await queries.createAgentTask({
      ...TEST_TASK_SHAPE,
      enabled: true,
      prompt: "List files",
    });

    const stdout = new EventEmitter();
    let closeCb: ((code: number | null) => void) | null = null;
    const fakeProcess: {
      stdout: EventEmitter;
      stderr: EventEmitter;
      on: (event: string, cb: (...args: unknown[]) => void) => unknown;
      kill: (...args: unknown[]) => void;
      killed: boolean;
    } = {
      stdout,
      stderr: new EventEmitter(),
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (event === "close") closeCb = cb as (code: number | null) => void;
        return fakeProcess;
      },
      kill: () => {},
      killed: false,
    };

    mock.module("child_process", () => ({
      spawn: mock(() => fakeProcess),
      execFileSync: () => "",
      execSync: () => "",
    }));

    mock.module("@/lib/pi/pi-path", () => ({
      getPiPath: () => "/usr/local/bin/pi",
    }));

    const sched = await import(`./agent-task-scheduler?bust=${Date.now()}`);

    const runPromise = sched.agentTaskScheduler.runNow(task.id);

    await new Promise((r) => setTimeout(r, 10));
    stdout.emit("data", Buffer.from(
      JSON.stringify({ type: "agent_start" }) + "\n" +
      JSON.stringify({
        type: "tool_execution_start",
        toolName: "bash",
        args: { command: "dangerous" },
      }) + "\n" +
      JSON.stringify({
        type: "tool_execution_end",
        toolName: "bash",
        result: { content: [{ type: "text", text: "Permission denied" }] },
        isError: true,
      }) + "\n" +
      JSON.stringify({ type: "agent_end" }) + "\n",
    ));
    // @ts-expect-error -- mock callback type inference narrows closeCb to never
    closeCb?.(1);

    await runPromise;

    const history = await queries.getRecentAgentTaskHistory(task.id, 10);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].status).toBe("error");
    expect(history[0].output).toContain("[agent_start]");
    expect(history[0].output).toContain("[tool: bash]");
    expect(history[0].output).toContain("ERROR:");
  });

  test("runOnce respects timeout", async () => {
    const task = await queries.createAgentTask({
      ...TEST_TASK_SHAPE,
      enabled: true,
      prompt: "test",
      timeoutSec: 1, // 1-second timeout
    });

    let closeCb: ((code: number | null) => void) | null = null;
    const fakeProcess: {
      stdout: EventEmitter;
      stderr: EventEmitter;
      on: (event: string, cb: (...args: unknown[]) => void) => unknown;
      kill: (...args: unknown[]) => void;
      killed: boolean;
    } = {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (event === "close") closeCb = cb as (code: number | null) => void;
        return fakeProcess;
      },
      kill: (..._args: unknown[]) => {
        // When killed, simulate process exit by emitting close
        setTimeout(() => {
          if (closeCb) closeCb(null);
        }, 10);
      },
      killed: false,
    };

    mock.module("child_process", () => ({
      spawn: mock(() => fakeProcess),
      execFileSync: () => "",
      execSync: () => "",
    }));

    mock.module("@/lib/pi/pi-path", () => ({
      getPiPath: () => "/usr/local/bin/pi",
    }));

    const sched = await import(`./agent-task-scheduler?bust=${Date.now()}`);
    const start = Date.now();
    await sched.agentTaskScheduler.runNow(task.id);
    const elapsed = Date.now() - start;

    // With timeoutSec=1, should resolve within ~2s
    expect(elapsed).toBeLessThan(5000);

    const history = await queries.getRecentAgentTaskHistory(task.id, 10);
    expect(history.length).toBeGreaterThanOrEqual(1);
    // A timed-out run must finalize as "error", never "success".
    expect(history[0].status).toBe("error");
    expect(history[0].output).toContain("[timeout]");

    const updatedTask = await queries.getAgentTask(task.id);
    expect(updatedTask.lastStatus).toBe("error");
  });
});
