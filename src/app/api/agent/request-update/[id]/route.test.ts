/**
 * Unit tests for POST /api/agent/request-update/[id]
 *
 * Sets updateRequested=true on a serverAgent row.
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

describe("POST /api/agent/request-update/[id]", () => {
  test("returns 200 and sets updateRequested=true on the agent", async () => {
    const agent = await testDB.db.serverAgent.create({
      data: { hostname: "u-host-1", updateRequested: false },
    });

    const { POST } = await loadRoute();
    const res = await POST(
      new Request(`http://localhost/api/agent/request-update/${agent.id}`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: String(agent.id) }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const updated = await testDB.db.serverAgent.findUnique({ where: { id: agent.id } });
    expect(updated?.updateRequested).toBe(true);
  });

  test("preserves the other agent rows that were not updated", async () => {
    const a = await testDB.db.serverAgent.create({ data: { hostname: "u-host-2" } });
    const b = await testDB.db.serverAgent.create({ data: { hostname: "u-host-3" } });

    const { POST } = await loadRoute();
    await POST(
      new Request(`http://localhost/api/agent/request-update/${a.id}`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: String(a.id) }) },
    );

    const updatedA = await testDB.db.serverAgent.findUnique({ where: { id: a.id } });
    const updatedB = await testDB.db.serverAgent.findUnique({ where: { id: b.id } });
    expect(updatedA?.updateRequested).toBe(true);
    expect(updatedB?.updateRequested).toBe(false);
  });

  test("returns 404 when the agent does not exist", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      new Request(`http://localhost/api/agent/request-update/99999`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "99999" }) },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Agent not found" });
  });
});
