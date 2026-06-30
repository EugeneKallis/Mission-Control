/**
 * Unit tests for GET /api/agents
 *
 * Returns serverAgent.findMany ordered by lastSeen desc. Returns
 * 500 with an error JSON if the dynamic @/lib/db import throws.
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

describe("GET /api/agents", () => {
  test("returns an empty array when no agents exist", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("returns all agents ordered by lastSeen desc", async () => {
    const now = Date.now();
    // Insert in order; lastSeen differs by 1ms.
    const oldest = await testDB.db.serverAgent.create({
      data: { hostname: "oldest", lastSeen: new Date(now - 3000) },
    });
    const middle = await testDB.db.serverAgent.create({
      data: { hostname: "middle", lastSeen: new Date(now - 2000) },
    });
    const newest = await testDB.db.serverAgent.create({
      data: { hostname: "newest", lastSeen: new Date(now - 1000) },
    });

    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: number; hostname: string }>;
    expect(body.map((a) => a.hostname)).toEqual([
      newest.hostname,
      middle.hostname,
      oldest.hostname,
    ]);
    expect(body).toHaveLength(3);
  });

  test("includes all serverAgent fields (hostname, ipAddress, etc.)", async () => {
    await testDB.db.serverAgent.create({
      data: {
        hostname: "rich",
        ipAddress: "10.0.0.5",
        cpuUsage: 12.5,
        version: "1.0.0",
      },
    });

    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0].hostname).toBe("rich");
    expect(body[0].ipAddress).toBe("10.0.0.5");
    expect(body[0].version).toBe("1.0.0");
  });

  test("returns 500 when the DB throws", async () => {
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
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to fetch agents" });
  });
});
