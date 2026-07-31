/**
 * Integration tests for src/lib/runner.ts
 *
 * runMacro is the macro execution engine — it loads a macro, creates
 * a history row, runs each command locally via child_process.spawn,
 * streams output through the LiveBus, and updates the history with
 * the final status.
 *
 * We exercise the local-execution path with a real child_process.spawn
 * against `echo` (and a real Prisma client via the shared test helper),
 * so the SQL round-trip + history persistence + LiveBus publishing are
 * all covered.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { liveBus } from "@/lib/live-bus";

let testDB: TestDB;
let q: typeof import("@/lib/db/queries");
let runner: typeof import("./runner");

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
  q = await import(`@/lib/db/queries?bust=${Date.now()}`);
  runner = await import(`./runner?bust=${Date.now()}`);
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.history.deleteMany();
  await testDB.db.schedule.deleteMany();
  await testDB.db.macro.deleteMany();
});

describe("runMacro — local execution", () => {
  test("runs a single echo command and records success in history", async () => {
    const macro = await testDB.db.macro.create({
      data: {
        name: "Echo Test",
        description: "Just echo",
        commands: JSON.stringify([{ ord: 0, cmd: "echo hello world" }]),
      },
    });

    const received: string[] = [];
    const unsub = liveBus.subscribe((m) => {
      if (m.type === "output" && m.text) received.push(m.text);
    });

    try {
      const result = await runner.runMacro(macro.id, "user");
      expect(result.status).toBe("success");
      expect(result.historyId).toBeGreaterThan(0);

      const hist = await testDB.db.history.findUnique({ where: { id: result.historyId } });
      expect(hist?.status).toBe("success");
      expect(hist?.triggeredBy).toBe("user");
      expect(hist?.output).toContain("=== Running Macro: Echo Test ===");
      expect(hist?.output).toContain("Triggered By: user");
      expect(hist?.output).toContain("> echo hello world");
      expect(hist?.output).toContain("hello world");
      expect(hist?.output).toContain("=== DONE ===");
    } finally {
      unsub();
    }
  });

  test("streams output chunks through the LiveBus as they arrive", async () => {
    const macro = await testDB.db.macro.create({
      data: {
        name: "Stream Test",
        commands: JSON.stringify([{ ord: 0, cmd: "printf 'a\\nb\\nc\\n'" }]),
      },
    });

    const seen: string[] = [];
    const unsub = liveBus.subscribe((m) => {
      if (m.type === "output" && m.text) seen.push(m.text);
    });

    try {
      const result = await runner.runMacro(macro.id, "user");
      expect(result.status).toBe("success");
      // The macro's output chunks (a, b, c) should appear somewhere in the bus
      expect(seen.join("")).toContain("a\n");
      expect(seen.join("")).toContain("b\n");
      expect(seen.join("")).toContain("c\n");
    } finally {
      unsub();
    }
  });

  test("fails and records 'failed' when a command exits non-zero", async () => {
    const macro = await testDB.db.macro.create({
      data: {
        name: "Failing",
        commands: JSON.stringify([{ ord: 0, cmd: "exit 7" }]),
      },
    });

    const result = await runner.runMacro(macro.id, "user");
    expect(result.status).toBe("failed");
    const hist = await testDB.db.history.findUnique({ where: { id: result.historyId } });
    expect(hist?.status).toBe("failed");
    expect(hist?.output).toContain("Command failed with exit code 7");
    expect(hist?.output).toContain("=== FAILED ===");
  });

  test("uses a custom working_dir when the command specifies one", async () => {
    const macro = await testDB.db.macro.create({
      data: {
        name: "CWD",
        commands: JSON.stringify([{ ord: 0, cmd: "pwd", working_dir: "/tmp" }]),
      },
    });
    const result = await runner.runMacro(macro.id, "user");
    expect(result.status).toBe("success");
    const hist = await testDB.db.history.findUnique({ where: { id: result.historyId } });
    // On Linux, /tmp exists; on macOS the same. On Windows the test would
    // behave differently — we skip if not POSIX.
    if (process.platform !== "win32") {
      expect(hist?.output).toContain("/tmp");
    }
  });

  test("treats a macro with malformed commands JSON as an empty command list", async () => {
    const macro = await testDB.db.macro.create({
      data: { name: "Bad JSON", commands: "not-json" },
    });
    const result = await runner.runMacro(macro.id, "user");
    // No commands to run → success
    expect(result.status).toBe("success");
  });

  test("runs multiple commands sequentially", async () => {
    const macro = await testDB.db.macro.create({
      data: {
        name: "Multi",
        commands: JSON.stringify([
          { ord: 0, cmd: "echo first" },
          { ord: 1, cmd: "echo second" },
        ]),
      },
    });
    const result = await runner.runMacro(macro.id, "user");
    expect(result.status).toBe("success");
    const hist = await testDB.db.history.findUnique({ where: { id: result.historyId } });
    expect(hist?.output).toContain("first");
    expect(hist?.output).toContain("second");
  });

  test("stops at the first failing command", async () => {
    const macro = await testDB.db.macro.create({
      data: {
        name: "Stops",
        commands: JSON.stringify([
          { ord: 0, cmd: "echo before-fail" },
          { ord: 1, cmd: "exit 1" },
          { ord: 2, cmd: "echo after-fail" }, // should never run
        ]),
      },
    });
    const result = await runner.runMacro(macro.id, "user");
    expect(result.status).toBe("failed");
    const hist = await testDB.db.history.findUnique({ where: { id: result.historyId } });
    expect(hist?.output).toContain("before-fail");
    expect(hist?.output).not.toContain("after-fail");
  });

  test("records spawn failure cleanly when the command itself can't start", async () => {
    // A non-existent binary should not throw out of runMacro — it should
    // be recorded as a failed run with a [spawn error: ...] line.
    const macro = await testDB.db.macro.create({
      data: {
        name: "Bad Binary",
        commands: JSON.stringify([{ ord: 0, cmd: "definitely-not-a-real-binary-xyz" }]),
      },
    });
    const result = await runner.runMacro(macro.id, "user");
    expect(result.status).toBe("failed");
    const hist = await testDB.db.history.findUnique({ where: { id: result.historyId } });
    expect(hist?.output).toContain("=== FAILED ===");
  });
});

