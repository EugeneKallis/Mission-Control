/**
 * Tests for agent-task DB queries (create, toggle, run-status, history, cleanup).
 *
 * Uses makeTestDB() for a fresh temp SQLite DB with all migrations applied.
 * The `mock.module("@/lib/db", ...)` replaces the dev-DB singleton so our
 * queries talk to the test DB instead.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { makeTestDB, type TestDB } from "./test-helpers";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

/**
 * Re-import queries.ts with a unique cache-buster so the mocked
 * @/lib/db is picked up.
 */
async function loadQueries(suffix: string) {
  return import(`./queries?bust=${Date.now()}-${suffix}`) as Promise<
    typeof import("./queries")
  >;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const defaultTask = {
  name: "Test task",
  prompt: "List all files in the repo",
  cronExpression: "*/30 * * * *",
};

const alternativeTask = {
  name: "Alternative task",
  prompt: "Check system status",
  cronExpression: "0 * * * *",
};

/** Clear agent_tasks and related history rows between describe blocks. */
async function clearAgentTaskData() {
  // Delete agent_tasks first; History's FK is ON DELETE SET NULL so history
  // rows will have their agentTaskId set to null, preserving non-agent history.
  await testDB.db.agentTask.deleteMany();
  // Also clean up any orphaned history rows that referenced agent tasks
  await testDB.db.history.deleteMany({ where: { agentTaskId: null, macroId: null, workerTimerId: null } });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("AgentTask queries", () => {
  beforeEach(async () => {
    await clearAgentTaskData();
  });
  test("createAgentTask creates a task with defaults", async () => {
    const q = await loadQueries("create1");
    const task = await q.createAgentTask(defaultTask);
    expect(task.id).toBeGreaterThan(0);
    expect(task.name).toBe("Test task");
    expect(task.prompt).toBe("List all files in the repo");
    expect(task.cronExpression).toBe("*/30 * * * *");
    expect(task.enabled).toBe(false); // default from schema
    expect(task.timeoutSec).toBe(300);
    expect(task.noSkills).toBe(false);
    expect(task.persistSession).toBe(false);
    expect(task.enabledTools).toBeNull();
    expect(task.disabledTools).toBeNull();
    expect(task.enabledSkills).toBeNull();
    expect(task.lastRunAt).toBeNull();
    expect(task.lastStatus).toBeNull();
    expect(task.createdAt).toBeInstanceOf(Date);
  });

  test("createAgentTask with all optional fields", async () => {
    const q = await loadQueries("create2");
    const task = await q.createAgentTask({
      ...defaultTask,
      enabled: true,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      thinkingLevel: "high",
      enabledTools: ["read", "grep", "ls"],
      disabledTools: ["bash"],
      enabledSkills: ["frontend", "testing"],
      noSkills: false,
      appendSystem: "Be very thorough.",
      persistSession: true,
      timeoutSec: 600,
    });
    expect(task.enabled).toBe(true);
    expect(task.provider).toBe("anthropic");
    expect(task.model).toBe("claude-sonnet-4-20250514");
    expect(task.thinkingLevel).toBe("high");
    expect(task.enabledTools).toBe('["read","grep","ls"]');
    expect(task.disabledTools).toBe('["bash"]');
    expect(task.enabledSkills).toBe('["frontend","testing"]');
    expect(task.appendSystem).toBe("Be very thorough.");
    expect(task.persistSession).toBe(true);
    expect(task.timeoutSec).toBe(600);
  });

  test("listAgentTasks returns all tasks ordered by createdAt asc", async () => {
    const q = await loadQueries("list1");
    const t1 = await q.createAgentTask({ ...defaultTask, name: "AAA" });
    const t2 = await q.createAgentTask({ ...alternativeTask, name: "BBB" });
    const t3 = await q.createAgentTask({ ...alternativeTask, name: "CCC" });

    const all = await q.listAgentTasks();
    // createdAt ascending — our create order should match
    expect(all.map((t) => t.name)).toEqual(["AAA", "BBB", "CCC"]);
    expect(all).toHaveLength(3);
  });

  test("getAgentTask returns the correct task", async () => {
    const q = await loadQueries("get1");
    const created = await q.createAgentTask(defaultTask);
    const fetched = await q.getAgentTask(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe("Test task");
  });

  test("getAgentTask throws on missing id", async () => {
    const q = await loadQueries("get404");
    await expect(q.getAgentTask(99999)).rejects.toThrow();
  });

  test("getEnabledAgentTasks returns only enabled tasks", async () => {
    const q = await loadQueries("enabled1");
    await q.createAgentTask({ ...defaultTask, name: "A", enabled: true });
    await q.createAgentTask({ ...alternativeTask, name: "B", enabled: false });
    await q.createAgentTask({ ...alternativeTask, name: "C", enabled: true });

    const enabled = await q.getEnabledAgentTasks();
    expect(enabled.map((t) => t.name).sort()).toEqual(["A", "C"]);
  });

  test("toggleAgentTask flips enabled state", async () => {
    const q = await loadQueries("toggle1");
    const task = await q.createAgentTask(defaultTask);
    expect(task.enabled).toBe(false);

    const toggledOn = await q.toggleAgentTask(task.id);
    expect(toggledOn.enabled).toBe(true);

    const toggledOff = await q.toggleAgentTask(task.id);
    expect(toggledOff.enabled).toBe(false);
  });

  test("deleteAgentTask removes the row", async () => {
    const q = await loadQueries("delete1");
    const task = await q.createAgentTask(defaultTask);
    await q.deleteAgentTask(task.id);
    await expect(q.getAgentTask(task.id)).rejects.toThrow();
  });

  test("updateAgentTaskRunStatus sets lastRunAt and lastStatus", async () => {
    const q = await loadQueries("status1");
    const task = await q.createAgentTask({ ...defaultTask, enabled: true });
    expect(task.lastRunAt).toBeNull();
    expect(task.lastStatus).toBeNull();

    await q.updateAgentTaskRunStatus(task.id, "success");
    const updated = await q.getAgentTask(task.id);
    expect(updated.lastRunAt).toBeInstanceOf(Date);
    expect(updated.lastStatus).toBe("success");

    // Verify it updates again
    await q.updateAgentTaskRunStatus(task.id, "error");
    const updated2 = await q.getAgentTask(task.id);
    expect(updated2.lastStatus).toBe("error");
  });

  test("updateAgentTask updates fields", async () => {
    const q = await loadQueries("update1");
    const task = await q.createAgentTask(defaultTask);
    const updated = await q.updateAgentTask(task.id, {
      prompt: "Updated prompt",
      timeoutSec: 120,
    });
    expect(updated.prompt).toBe("Updated prompt");
    expect(updated.timeoutSec).toBe(120);
    expect(updated.name).toBe(defaultTask.name); // unchanged
  });
});

describe("AgentTask → History linkage", () => {
  beforeEach(async () => {
    await clearAgentTaskData();
  });
  test("createHistory with agentTaskId links correctly", async () => {
    const q = await loadQueries("hl1");
    const task = await q.createAgentTask(defaultTask);

    const h = await q.createHistory({
      agentTaskId: task.id,
      status: "running",
      triggeredBy: "schedule",
    });
    expect(h.agentTaskId).toBe(task.id);
    expect(h.id).toBeGreaterThan(0);
    expect(h.status).toBe("running");
    expect(h.triggeredBy).toBe("schedule");
  });

  test("getRecentAgentTaskHistory returns runs in desc order", async () => {
    const q = await loadQueries("hl2");
    const task = await q.createAgentTask(defaultTask);

    const h1 = await q.createHistory({ agentTaskId: task.id, status: "success" });
    // Small delay so timestamps differ
    await new Promise((r) => setTimeout(r, 10));
    const h2 = await q.createHistory({ agentTaskId: task.id, status: "running" });
    await new Promise((r) => setTimeout(r, 10));
    const h3 = await q.createHistory({ agentTaskId: task.id, status: "error" });

    const runs = await q.getRecentAgentTaskHistory(task.id, 5);
    expect(runs).toHaveLength(3);
    // Most recent first
    expect(runs[0].id).toBe(h3.id);
    expect(runs[1].id).toBe(h2.id);
    expect(runs[2].id).toBe(h1.id);
    // Each row includes the agentTask name
    expect(runs[0].agentTask?.name).toBe("Test task");
  });

  test("getRecentAgentTaskHistory limits correctly", async () => {
    const q = await loadQueries("hl3");
    const task = await q.createAgentTask(defaultTask);
    for (let i = 0; i < 10; i++) {
      await q.createHistory({ agentTaskId: task.id, status: "success" });
    }
    const runs = await q.getRecentAgentTaskHistory(task.id, 3);
    expect(runs).toHaveLength(3);
  });

  test("getRecentAgentTaskHistory without taskId returns runs for all tasks", async () => {
    const q = await loadQueries("hl4");
    const t1 = await q.createAgentTask({ ...defaultTask, name: "Task A" });
    const t2 = await q.createAgentTask({ ...alternativeTask, name: "Task B" });

    await q.createHistory({ agentTaskId: t1.id, status: "success" });
    await new Promise((r) => setTimeout(r, 10));
    await q.createHistory({ agentTaskId: t2.id, status: "error" });

    const all = await q.getRecentAgentTaskHistory(undefined, 10);
    expect(all).toHaveLength(2);
    // Each row should have agentTask populated
    expect(all.some((r) => r.agentTask?.name === "Task A")).toBe(true);
    expect(all.some((r) => r.agentTask?.name === "Task B")).toBe(true);
  });
});

describe("cleanOldAgentTaskHistory", () => {
  beforeEach(async () => {
    await clearAgentTaskData();
  });
  test("prunes old runs keeping only most recent N", async () => {
    const q = await loadQueries("clean1");
    const task = await q.createAgentTask(defaultTask);

    // Insert 10 history rows
    const ids: number[] = [];
    for (let i = 0; i < 10; i++) {
      const h = await q.createHistory({ agentTaskId: task.id, status: "success" });
      ids.push(h.id);
      await new Promise((r) => setTimeout(r, 5));
    }

    // Keep only the 3 most recent
    const deleted = await q.cleanOldAgentTaskHistory(task.id, 3);
    expect(deleted).toBe(7);

    const remaining = await testDB.db.history.findMany({
      where: { agentTaskId: task.id },
      orderBy: { startTime: "desc" },
    });
    expect(remaining).toHaveLength(3);
    // The 3 most recent = the last 3 ids we inserted
    expect(remaining.map((r) => r.id)).toEqual(ids.slice(-3).reverse());
  });

  test("does nothing when history count is below keep threshold", async () => {
    const q = await loadQueries("clean2");
    const task = await q.createAgentTask(defaultTask);
    for (let i = 0; i < 3; i++) {
      await q.createHistory({ agentTaskId: task.id, status: "success" });
    }
    const deleted = await q.cleanOldAgentTaskHistory(task.id, 5);
    expect(deleted).toBe(0);

    const remaining = await testDB.db.history.count({
      where: { agentTaskId: task.id },
    });
    expect(remaining).toBe(3);
  });

  test("only prunes history for the specified task, not others", async () => {
    const q = await loadQueries("clean3");
    const t1 = await q.createAgentTask({ ...defaultTask, name: "Keep me" });
    const t2 = await q.createAgentTask({ ...alternativeTask, name: "Prune me" });

    for (let i = 0; i < 5; i++) {
      await q.createHistory({ agentTaskId: t1.id, status: "success" });
      await q.createHistory({ agentTaskId: t2.id, status: "success" });
    }

    const deleted = await q.cleanOldAgentTaskHistory(t2.id, 2);
    expect(deleted).toBe(3);

    const remainingT1 = await testDB.db.history.count({
      where: { agentTaskId: t1.id },
    });
    expect(remainingT1).toBe(5); // untouched

    const remainingT2 = await testDB.db.history.count({
      where: { agentTaskId: t2.id },
    });
    expect(remainingT2).toBe(2);
  });
});
