/**
 * Integration tests for src/lib/runner.ts
 *
 * runMacro is the macro execution engine — it loads a macro, creates
 * a history row, runs each command (locally via child_process.spawn or
 * remotely via the agent registry), streams output through the LiveBus,
 * and updates the history with the final status.
 *
 * We exercise the local-execution path with a real child_process.spawn
 * against `echo` (and a real Prisma client via the shared test helper),
 * so the SQL round-trip + history persistence + LiveBus publishing are
 * all covered.
 *
 * The remote-execution path is tested by registering a real mock
 * WebSocket on the *real* `agentRegistry` singleton. We do NOT use
 * `mock.module` here because that would replace the global registry
 * for every other test file in the same `bun test` run.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { liveBus } from "@/lib/live-bus";
import { agentRegistry, type AgentMessage } from "@/lib/agents/registry";

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

afterEach(() => {
  // Clean up any agents we registered so they don't leak.
  for (const h of agentRegistry.connectedHostnames()) {
    try {
      agentRegistry.unregister(h);
    } catch {
      /* noop */
    }
  }
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

  test("ignores agent hostname override for non-agent macros (regression)", async () => {
    // Regression test: a macro with runOnAgent=false and a stale agentHostname
    // must run locally and must NOT print a misleading "Node: ..." header.
    // The previous behavior would set resolvedAgent from the URL `?agent=`
    // override, print "Node: e2e-test", and then fall through to local
    // execution — which crashed with `Bun is not defined` under Node.
    const macro = await testDB.db.macro.create({
      data: {
        name: "Local With Stale Agent",
        runOnAgent: false,
        agentHostname: "e2e-test",
        commands: JSON.stringify([{ ord: 0, cmd: "echo local-ok" }]),
      },
    });
    // Pass an `agentHostname` arg as if it came from `?agent=e2e-test`.
    const result = await runner.runMacro(macro.id, "user", "e2e-test");
    expect(result.status).toBe("success");
    const hist = await testDB.db.history.findUnique({ where: { id: result.historyId } });
    expect(hist?.output).toContain("echo local-ok");
    expect(hist?.output).toContain("local-ok");
    expect(hist?.output).not.toContain("Node: e2e-test");
    expect(hist?.output).toContain("=== DONE ===");
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

describe("runMacro — agent execution (real registry, mock WebSocket)", () => {
  /**
   * Install a mock WebSocket on the *real* agentRegistry singleton for a
   * given hostname. When the runner dispatches a command, we capture the
   * outgoing message, then deliver a scripted sequence of output chunks
   * + an exit message so the runner can finalize the history.
   */
  function installAgent(hostname: string, script: (cmd: string) => { output: string[]; exitCode: number }) {
    const sentFrames: string[] = [];
    const ws = {
      readyState: 1, // OPEN
      sent: [] as string[],
      send(data: string) {
        this.sent.push(data);
        sentFrames.push(data);
      },
      close() {
        this.readyState = 3;
      },
    };
    agentRegistry.register(hostname, ws as unknown as import("ws").WebSocket, "10.0.0.1");

    // Patch ws.send to also drive the deliver on the next microtask. Use a
    // regular function (not an arrow) so `this` is bound to `ws` when the
    // registry calls `ws.send(payload)`.
    const originalSend = ws.send;
    ws.send = function (this: typeof ws, data: string) {
      originalSend.call(this, data);
      const payload = JSON.parse(data) as { commandID: number; command: string };
      const result = script(payload.command);
      // Deliver output + exit asynchronously (matches real agent behavior).
      queueMicrotask(() => {
        for (const chunk of result.output) {
          const msg: AgentMessage = { type: "output", commandID: payload.commandID, payload: chunk };
          agentRegistry.deliver(hostname, msg);
        }
        const exitMsg: AgentMessage = {
          type: "exit",
          commandID: payload.commandID,
          exitCode: result.exitCode,
        };
        agentRegistry.deliver(hostname, exitMsg);
      });
    };

    return { ws, sentFrames };
  }

  test("fails cleanly when the macro wants an agent but none is connected", async () => {
    const macro = await testDB.db.macro.create({
      data: {
        name: "Remote",
        runOnAgent: true,
        agentHostname: "no-such-host",
        commands: JSON.stringify([{ ord: 0, cmd: "echo hi" }]),
      },
    });
    const result = await runner.runMacro(macro.id, "user");
    expect(result.status).toBe("failed");
    const hist = await testDB.db.history.findUnique({ where: { id: result.historyId } });
    expect(hist?.output).toContain("ERROR: Agent no-such-host is not connected");
    expect(hist?.output).toContain("=== FAILED ===");
  });

  test("fails when runOnAgent is true but agentHostname is empty", async () => {
    const macro = await testDB.db.macro.create({
      data: {
        name: "Remote NoHost",
        runOnAgent: true,
        agentHostname: "",
        commands: JSON.stringify([{ ord: 0, cmd: "echo hi" }]),
      },
    });
    const result = await runner.runMacro(macro.id, "user");
    expect(result.status).toBe("failed");
    const hist = await testDB.db.history.findUnique({ where: { id: result.historyId } });
    expect(hist?.output).toContain("no agent was selected");
  });

  test("dispatches commands through the real registry when an agent is connected", async () => {
    installAgent("host-1", () => ({
      output: ["hello from agent\n", "more output\n"],
      exitCode: 0,
    }));

    const macro = await testDB.db.macro.create({
      data: {
        name: "Agent Run",
        runOnAgent: true,
        agentHostname: "host-1",
        commands: JSON.stringify([{ ord: 0, cmd: "remote-cmd", working_dir: "/srv" }]),
      },
    });
    const result = await runner.runMacro(macro.id, "schedule");
    expect(result.status).toBe("success");
    const hist = await testDB.db.history.findUnique({ where: { id: result.historyId } });
    expect(hist?.triggeredBy).toBe("schedule");
    expect(hist?.output).toContain("Node: host-1");
    expect(hist?.output).toContain("hello from agent");
    expect(hist?.output).toContain("more output");
    expect(hist?.output).toContain("=== DONE ===");
  });

  test("records failure when the agent reports a non-zero exit code", async () => {
    installAgent("host-2", () => ({ output: [], exitCode: 2 }));

    const macro = await testDB.db.macro.create({
      data: {
        name: "Agent Fail",
        runOnAgent: true,
        agentHostname: "host-2",
        commands: JSON.stringify([{ ord: 0, cmd: "remote-cmd" }]),
      },
    });
    const result = await runner.runMacro(macro.id, "user");
    expect(result.status).toBe("failed");
    const hist = await testDB.db.history.findUnique({ where: { id: result.historyId } });
    expect(hist?.output).toContain("Command failed with exit code 2");
  });
});

