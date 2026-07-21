/**
 * Unit tests for /api/agent-tasks and its sub-routes.
 *
 * Spins up a temp-file Prisma client, mocks @/lib/db and
 * @/lib/agent-task-scheduler, then imports each route module
 * with cache-busting.
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
let addTaskMock: ReturnType<typeof mock>;
let removeTaskMock: ReturnType<typeof mock>;
let updateTaskMock: ReturnType<typeof mock>;
let runNowMock: ReturnType<typeof mock>;

const mockScheduler = {
  addTask: (..._args: unknown[]) => addTaskMock(..._args),
  removeTask: (..._args: unknown[]) => removeTaskMock(..._args),
  updateTask: (..._args: unknown[]) => updateTaskMock(..._args),
  runNow: (..._args: unknown[]) => runNowMock(..._args),
  init: mock(async () => {}),
  stopAll: mock(async () => {}),
};

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
  mock.module("@/lib/agent-task-scheduler", () => ({
    agentTaskScheduler: mockScheduler,
  }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  addTaskMock = mock(async () => {});
  removeTaskMock = mock(async () => {});
  updateTaskMock = mock(async () => {});
  runNowMock = mock(async () => {});
  mockScheduler.addTask = addTaskMock;
  mockScheduler.removeTask = removeTaskMock;
  mockScheduler.updateTask = updateTaskMock;
  mockScheduler.runNow = runNowMock;

  await testDB.db.history.deleteMany();
  await testDB.db.agentTask.deleteMany();
});

const TASK_PAYLOAD = {
  name: "Test Task",
  prompt: "List files",
  cronExpression: "*/5 * * * *",
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function loadMain() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

async function loadById() {
  return import(`./[id]/route?bust=${Date.now()}-${Math.random()}`);
}

async function loadToggle() {
  return import(`./[id]/toggle/route?bust=${Date.now()}-${Math.random()}`);
}

async function loadRun() {
  return import(`./[id]/run/route?bust=${Date.now()}-${Math.random()}`);
}

async function loadRuns() {
  return import(`./[id]/runs/route?bust=${Date.now()}-${Math.random()}`);
}

async function loadResources() {
  return import(`./resources/route?bust=${Date.now()}-${Math.random()}`);
}

// ── GET /api/agent-tasks ─────────────────────────────────────────────────

describe("GET /api/agent-tasks", () => {
  test("returns 200 with empty tasks array when none exist", async () => {
    const { GET } = await loadMain();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = await jsonBody(res) as { tasks: unknown[]; tools: unknown[]; skills: unknown[] };
    expect(body.tasks).toEqual([]);
    expect(Array.isArray(body.tools)).toBe(true);
    expect(Array.isArray(body.skills)).toBe(true);
  });

  test("returns 200 with created tasks", async () => {
    await testDB.db.agentTask.create({
      data: { name: "T1", prompt: "p1", cronExpression: "*/10 * * * *" },
    });
    const { GET } = await loadMain();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = await jsonBody(res) as { tasks: Array<{ name: string }> };
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].name).toBe("T1");
  });
});

// ── POST /api/agent-tasks ────────────────────────────────────────────────

describe("POST /api/agent-tasks", () => {
  test("returns 201 and creates a task", async () => {
    const { POST } = await loadMain();
    const res = await POST(jsonRequest("/api/agent-tasks", TASK_PAYLOAD));
    expect(status(res)).toBe(201);
    const body = await jsonBody(res) as { id: number; name: string; enabled: boolean };
    expect(body.name).toBe("Test Task");
    expect(body.enabled).toBe(false);
  });

  test("scheduler.addTask is called when enabled=true", async () => {
    const { POST } = await loadMain();
    await POST(jsonRequest("/api/agent-tasks", { ...TASK_PAYLOAD, enabled: true }));
    expect(addTaskMock).toHaveBeenCalledTimes(1);
  });

  test("scheduler.addTask is NOT called when enabled=false", async () => {
    const { POST } = await loadMain();
    await POST(jsonRequest("/api/agent-tasks", { ...TASK_PAYLOAD, enabled: false }));
    expect(addTaskMock).not.toHaveBeenCalled();
  });

  test("returns 400 for missing required fields", async () => {
    const { POST } = await loadMain();
    const res = await POST(jsonRequest("/api/agent-tasks", { name: "only name" }));
    expect(status(res)).toBe(400);
  });

  test("returns 400 for invalid cron expression", async () => {
    const { POST } = await loadMain();
    const res = await POST(jsonRequest("/api/agent-tasks", { ...TASK_PAYLOAD, cronExpression: "not-a-cron" }));
    expect(status(res)).toBe(400);
  });
});

// ── GET /api/agent-tasks/[id] ────────────────────────────────────────────

describe("GET /api/agent-tasks/[id]", () => {
  test("returns 200 with the task", async () => {
    const task = await testDB.db.agentTask.create({
      data: { name: "My Task", prompt: "p", cronExpression: "*/5 * * * *" },
    });
    const { GET } = await loadById();
    const res = await GET(getRequest(), { params: Promise.resolve({ id: String(task.id) }) });
    expect(status(res)).toBe(200);
    const body = await jsonBody(res) as { name: string };
    expect(body.name).toBe("My Task");
  });

  test("returns 404 for non-existent task", async () => {
    const { GET } = await loadById();
    const res = await GET(getRequest(), { params: Promise.resolve({ id: "9999" }) });
    expect(status(res)).toBe(404);
  });

  test("returns 400 for invalid id", async () => {
    const { GET } = await loadById();
    const res = await GET(getRequest(), { params: Promise.resolve({ id: "abc" }) });
    expect(status(res)).toBe(400);
  });
});

// ── PUT /api/agent-tasks/[id] ────────────────────────────────────────────

describe("PUT /api/agent-tasks/[id]", () => {
  test("returns 200 and updates the task", async () => {
    const task = await testDB.db.agentTask.create({
      data: { name: "Old", prompt: "old", cronExpression: "*/5 * * * *" },
    });
    const { PUT } = await loadById();
    const res = await PUT(
      jsonRequest("/api/agent-tasks/1", { name: "Updated" }),
      { params: Promise.resolve({ id: String(task.id) }) },
    );
    expect(status(res)).toBe(200);
    const body = await jsonBody(res) as { name: string };
    expect(body.name).toBe("Updated");
  });

  test("calls scheduler.addTask when task is enabled", async () => {
    const task = await testDB.db.agentTask.create({
      data: { name: "T", prompt: "p", cronExpression: "*/5 * * * *", enabled: true },
    });
    const { PUT } = await loadById();
    await PUT(
      jsonRequest("/api/agent-tasks/1", { name: "Updated" }),
      { params: Promise.resolve({ id: String(task.id) }) },
    );
    expect(addTaskMock).toHaveBeenCalled();
  });

  test("calls scheduler.removeTask when task becomes disabled", async () => {
    const task = await testDB.db.agentTask.create({
      data: { name: "T", prompt: "p", cronExpression: "*/5 * * * *", enabled: true },
    });
    const { PUT } = await loadById();
    await PUT(
      jsonRequest("/api/agent-tasks/1", { enabled: false }),
      { params: Promise.resolve({ id: String(task.id) }) },
    );
    expect(removeTaskMock).toHaveBeenCalled();
  });

  test("returns 404 for non-existent task", async () => {
    const { PUT } = await loadById();
    const res = await PUT(
      jsonRequest("/api/agent-tasks/9999", { name: "Nope" }),
      { params: Promise.resolve({ id: "9999" }) },
    );
    expect(status(res)).toBe(404);
  });
});

// ── DELETE /api/agent-tasks/[id] ─────────────────────────────────────────

describe("DELETE /api/agent-tasks/[id]", () => {
  test("returns 200 and deletes the task", async () => {
    const task = await testDB.db.agentTask.create({
      data: { name: "Del", prompt: "p", cronExpression: "*/5 * * * *" },
    });
    const { DELETE } = await loadById();
    const res = await DELETE(getRequest(), { params: Promise.resolve({ id: String(task.id) }) });
    expect(status(res)).toBe(200);

    const remaining = await testDB.db.agentTask.findMany();
    expect(remaining).toHaveLength(0);
  });

  test("calls scheduler.removeTask", async () => {
    const task = await testDB.db.agentTask.create({
      data: { name: "Del", prompt: "p", cronExpression: "*/5 * * * *" },
    });
    const { DELETE } = await loadById();
    await DELETE(getRequest(), { params: Promise.resolve({ id: String(task.id) }) });
    expect(removeTaskMock).toHaveBeenCalled();
  });
});

// ── POST /api/agent-tasks/[id]/toggle ────────────────────────────────────

describe("POST /api/agent-tasks/[id]/toggle", () => {
  test("toggles enabled from false to true and calls scheduler.addTask", async () => {
    const task = await testDB.db.agentTask.create({
      data: { name: "Tog", prompt: "p", cronExpression: "*/5 * * * *", enabled: false },
    });
    const { POST } = await loadToggle();
    const res = await POST(getRequest(), { params: Promise.resolve({ id: String(task.id) }) });
    expect(status(res)).toBe(200);
    const body = await jsonBody(res) as { enabled: boolean };
    expect(body.enabled).toBe(true);
    expect(addTaskMock).toHaveBeenCalled();
  });

  test("toggles enabled from true to false and calls scheduler.removeTask", async () => {
    const task = await testDB.db.agentTask.create({
      data: { name: "Tog", prompt: "p", cronExpression: "*/5 * * * *", enabled: true },
    });
    const { POST } = await loadToggle();
    const res = await POST(getRequest(), { params: Promise.resolve({ id: String(task.id) }) });
    expect(status(res)).toBe(200);
    const body = await jsonBody(res) as { enabled: boolean };
    expect(body.enabled).toBe(false);
    expect(removeTaskMock).toHaveBeenCalled();
  });
});

// ── POST /api/agent-tasks/[id]/run ────────────────────────────────────────

describe("POST /api/agent-tasks/[id]/run", () => {
  test("returns 202 and dispatches runNow", async () => {
    const task = await testDB.db.agentTask.create({
      data: { name: "Run", prompt: "p", cronExpression: "*/5 * * * *" },
    });
    const { POST } = await loadRun();
    const res = await POST(getRequest(), { params: Promise.resolve({ id: String(task.id) }) });
    expect(status(res)).toBe(202);
    expect(runNowMock).toHaveBeenCalled();
  });

  test("returns 404 for non-existent task", async () => {
    const { POST } = await loadRun();
    const res = await POST(getRequest(), { params: Promise.resolve({ id: "9999" }) });
    expect(status(res)).toBe(404);
  });
});

// ── GET /api/agent-tasks/[id]/runs ────────────────────────────────────────

describe("GET /api/agent-tasks/[id]/runs", () => {
  test("returns 200 with run history", async () => {
    const task = await testDB.db.agentTask.create({
      data: { name: "Hist", prompt: "p", cronExpression: "*/5 * * * *" },
    });
    await testDB.db.history.create({
      data: { agentTaskId: task.id, status: "success", startTime: new Date() },
    });
    const { GET } = await loadRuns();
    const res = await GET(getRequest(), { params: Promise.resolve({ id: String(task.id) }) });
    expect(status(res)).toBe(200);
    const body = await jsonBody(res) as { history: Array<{ status: string }> };
    expect(body.history).toHaveLength(1);
    expect(body.history[0].status).toBe("success");
  });

  test("returns 200 with empty history when no runs exist", async () => {
    const task = await testDB.db.agentTask.create({
      data: { name: "NoRun", prompt: "p", cronExpression: "*/5 * * * *" },
    });
    const { GET } = await loadRuns();
    const res = await GET(getRequest(), { params: Promise.resolve({ id: String(task.id) }) });
    expect(status(res)).toBe(200);
    const body = await jsonBody(res) as { history: unknown[] };
    expect(body.history).toEqual([]);
  });
});

// ── GET /api/agent-tasks/resources ────────────────────────────────────────

describe("GET /api/agent-tasks/resources", () => {
  test("returns 200 with tools and skills arrays", async () => {
    const { GET } = await loadResources();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = await jsonBody(res) as { tools: unknown[]; skills: unknown[] };
    expect(Array.isArray(body.tools)).toBe(true);
    expect(Array.isArray(body.skills)).toBe(true);
  });
});
