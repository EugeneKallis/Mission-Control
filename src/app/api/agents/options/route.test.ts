/**
 * Unit tests for GET /api/agents/options
 *
 * Returns a minimal { id, hostname } list for the agent-picker
 * dropdown, ordered by hostname asc. On any DB error, returns []
 * (the route swallows the failure so the modal can fall back to
 * "no agents" UI).
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

describe("GET /api/agents/options", () => {
  test("returns an empty array when no agents exist", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("returns only { id, hostname } for each agent", async () => {
    await testDB.db.serverAgent.create({
      data: {
        hostname: "opts-1",
        ipAddress: "10.0.0.1",
        version: "1.2.3",
        cpuUsage: 50,
      },
    });
    const { GET } = await loadRoute();
    const body = (await (await GET()).json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(Object.keys(body[0]).sort()).toEqual(["hostname", "id"]);
    expect(body[0].hostname).toBe("opts-1");
    // ipAddress, version, cpuUsage should NOT be in the result
    expect(body[0].ipAddress).toBeUndefined();
    expect(body[0].version).toBeUndefined();
  });

  test("orders results by hostname ascending", async () => {
    await testDB.db.serverAgent.create({ data: { hostname: "zulu" } });
    await testDB.db.serverAgent.create({ data: { hostname: "alpha" } });
    await testDB.db.serverAgent.create({ data: { hostname: "mike" } });

    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await res.json()) as Array<{ hostname: string }>;
    expect(body.map((a) => a.hostname)).toEqual(["alpha", "mike", "zulu"]);
  });

  test("returns an empty array when the DB throws (not 500)", async () => {
    mock.module("@/lib/db", () => ({
      db: {
        serverAgent: {
          findMany: async () => {
            throw new Error("DB unavailable");
          },
        },
      },
    }));
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
