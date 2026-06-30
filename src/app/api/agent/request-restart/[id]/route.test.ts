/**
 * Unit tests for POST /api/agent/request-restart/[id]
 *
 * Sets restartRequested=true on a serverAgent row. The route uses
 * `await import("@/lib/db")` inside the handler, so the mock.module
 * injection works for both the top-level route and the dynamic import.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.serverAgent.deleteMany();
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("POST /api/agent/request-restart/[id]", () => {
  test("returns 200 and sets restartRequested=true on the agent", async () => {
    const agent = await testDB.db.serverAgent.create({
      data: { hostname: "r-host-1", restartRequested: false },
    });

    const { POST } = await loadRoute();
    const res = await POST(
      new Request(`http://localhost/api/agent/request-restart/${agent.id}`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: String(agent.id) }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const updated = await testDB.db.serverAgent.findUnique({ where: { id: agent.id } });
    expect(updated?.restartRequested).toBe(true);
  });

  test("is idempotent — calling twice keeps restartRequested=true", async () => {
    const agent = await testDB.db.serverAgent.create({
      data: { hostname: "r-host-2" },
    });

    const { POST } = await loadRoute();
    await POST(
      new Request(`http://localhost/api/agent/request-restart/${agent.id}`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: String(agent.id) }) },
    );
    await POST(
      new Request(`http://localhost/api/agent/request-restart/${agent.id}`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: String(agent.id) }) },
    );
    const updated = await testDB.db.serverAgent.findUnique({ where: { id: agent.id } });
    expect(updated?.restartRequested).toBe(true);
  });

  test("returns 404 when the agent does not exist", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      new Request(`http://localhost/api/agent/request-restart/9999`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "9999" }) },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Agent not found" });
  });
});
