/**
 * Unit tests for POST /api/agent/request-update-all
 *
 * Calls updateMany with no filter. Returns 200 either way — the
 * route swallows DB errors and returns a "no agents" note on failure.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
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

describe("POST /api/agent/request-update-all", () => {
  test("returns 200 when no agents exist (no rows to update)", async () => {
    const { POST } = await loadRoute();
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  test("flips updateRequested=true on every existing agent", async () => {
    await testDB.db.serverAgent.createMany({
      data: [
        { hostname: "all-1", updateRequested: false },
        { hostname: "all-2", updateRequested: false },
        { hostname: "all-3", updateRequested: false },
      ],
    });

    const { POST } = await loadRoute();
    const res = await POST();
    expect(res.status).toBe(200);

    const all = await testDB.db.serverAgent.findMany();
    expect(all).toHaveLength(3);
    for (const agent of all) {
      expect(agent.updateRequested).toBe(true);
    }
  });

  test("returns 200 with note when the DB throws", async () => {
    // Force the dynamic import inside the route to fail.
    // We use a beforeAll-time mock by re-mocking @/lib/db with a stub.
    mock.module("@/lib/db", () => {
      // The route does `await import("@/lib/db")` and immediately calls
      // `db.serverAgent.updateMany`. Returning an object whose
      // updateMany throws simulates a runtime DB error.
      const thrower = {
        serverAgent: {
          updateMany: async () => {
            throw new Error("DB unavailable");
          },
        },
      };
      return { db: thrower };
    });

    const { POST } = await loadRoute();
    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; note?: string };
    expect(body.success).toBe(true);
    expect(body.note).toContain("No agents to update");
  });
});
