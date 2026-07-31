/**
 * Unit tests for src/lib/log-fetcher.ts
 *
 * Mocks `child_process` to verify journalctl/systemctl invocations and
 * @/lib/db for the agent-tasks branch.
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
import type { PrismaClient } from "@prisma/client";
import { makeTestDB } from "@/lib/db/test-helpers";

let execFileSyncMock: ReturnType<typeof mock>;

const childProcessMock = {
  execFileSync: (..._args: unknown[]) => execFileSyncMock(..._args),
};

interface ExecCall {
  cmd: string;
  args: string[];
}

let execCalls: ExecCall[] = [];
let testDB: { db: PrismaClient; cleanup: () => Promise<void> };

beforeAll(() => {
  mock.module("child_process", () => childProcessMock);
});

beforeEach(async () => {
  execCalls = [];
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));

  execFileSyncMock = mock((cmd: string, args: string[]) => {
    execCalls.push({ cmd, args: [...args] });
    if (cmd === "systemctl" && args.includes("show")) {
      return "2024-01-01 12:00:00 UTC";
    }
    if (cmd === "journalctl") {
      return "info: running\nERROR: something failed\n";
    }
    return "";
  });
});

afterAll(async () => {
  await Promise.resolve();
});

afterAll(async () => {
  await testDB.cleanup();
});

async function loadModule() {
  return import(`./log-fetcher?bust=${Date.now()}-${Math.random()}`);
}

describe("fetchJournalctlLogs", () => {
  test("returns text and no error on success", async () => {
    const { fetchJournalctlLogs } = await loadModule();
    const result = fetchJournalctlLogs("web", "all");
    expect(result.error).toBeNull();
    expect(result.text).toContain("ERROR: something failed");
  });

  test("uses --since with ActiveEnterTimestamp for lines=all", async () => {
    const { fetchJournalctlLogs } = await loadModule();
    fetchJournalctlLogs("web", "all");
    const call = execCalls.find((c) => c.cmd === "journalctl");
    expect(call).toBeDefined();
    expect(call!.args).toContain("--since");
    expect(call!.args).toContain("2024-01-01 12:00:00 UTC");
    expect(call!.args).not.toContain("-n");
  });

  test("uses -n for numeric lines", async () => {
    const { fetchJournalctlLogs } = await loadModule();
    fetchJournalctlLogs("web", 250);
    const call = execCalls.find((c) => c.cmd === "journalctl");
    expect(call!.args).toContain("-n");
    expect(call!.args).toContain("250");
    expect(call!.args).not.toContain("--since");
  });

  test("returns an error message on journalctl failure", async () => {
    execFileSyncMock = mock((cmd: string) => {
      if (cmd === "journalctl") throw new Error("boom");
      return "";
    });
    const { fetchJournalctlLogs } = await loadModule();
    const result = fetchJournalctlLogs("web", "all");
    expect(result.text).toBe("");
    expect(result.error).toContain("Failed to fetch logs");
  });

  test("returns an error for unknown services", async () => {
    const { fetchJournalctlLogs } = await loadModule();
    const result = fetchJournalctlLogs("unknown-svc", "all");
    expect(result.text).toBe("");
    expect(result.error).toContain("Unknown service");
  });
});

describe("fetchAgentTaskLogs", () => {
  test("returns rendered transcript for recent runs", async () => {
    const task = await testDB.db.agentTask.create({
      data: {
        name: "Daily Check",
        prompt: "check",
        cronExpression: "0 6 * * *",
        enabled: true,
      },
    });
    await testDB.db.history.create({
      data: {
        agentTaskId: task.id,
        startTime: new Date(),
        status: "error",
        output: "Error: task failed",
        triggeredBy: "schedule",
      },
    });

    const { fetchAgentTaskLogs } = await loadModule();
    const result = await fetchAgentTaskLogs("all");
    expect(result.error).toBeNull();
    expect(result.text).toContain("=== Daily Check \u2014");
    expect(result.text).toContain("Error: task failed");
  });

  test("limits runs when lines is numeric", async () => {
    const task = await testDB.db.agentTask.create({
      data: {
        name: "Frequent",
        prompt: "check",
        cronExpression: "* * * * *",
        enabled: true,
      },
    });
    for (let i = 0; i < 5; i++) {
      await testDB.db.history.create({
        data: {
          agentTaskId: task.id,
          startTime: new Date(Date.now() - i * 1000),
          status: "success",
          output: `run ${i}`,
          triggeredBy: "schedule",
        },
      });
    }

    const { fetchAgentTaskLogs } = await loadModule();
    const result = await fetchAgentTaskLogs(2);
    const headers = result.text.match(/=== Frequent \u2014/g);
    expect(headers?.length).toBe(2);
  });

  test("returns placeholder text when no history exists", async () => {
    const { fetchAgentTaskLogs } = await loadModule();
    const result = await fetchAgentTaskLogs("all");
    expect(result.error).toBeNull();
    expect(result.text).toBe("(no agent task history)");
  });
});

describe("fetchLogText", () => {
  test("routes agent-tasks to the DB branch", async () => {
    const { fetchLogText } = await loadModule();
    const result = await fetchLogText("agent-tasks", "all");
    expect(result.error).toBeNull();
    expect(result.text).toBe("(no agent task history)");
  });

  test("routes systemd services to journalctl", async () => {
    const { fetchLogText } = await loadModule();
    const result = await fetchLogText("scraper", "all");
    expect(result.error).toBeNull();
    expect(result.text).toContain("ERROR: something failed");
    const call = execCalls.find(
      (c) => c.cmd === "journalctl" && c.args.includes("mission-control-scraper.service"),
    );
    expect(call).toBeDefined();
  });
});
