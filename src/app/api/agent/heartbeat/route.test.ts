/**
 * Unit tests for POST /api/agent/heartbeat
 *
 * The heartbeat endpoint:
 *  1. Upserts the serverAgent row via upsertServerAgent.
 *  2. Optionally routes a result payload to the agentRegistry.
 *
 * Tests use makeTestDB() and mock.module("@/lib/db"). The real
 * agentRegistry singleton is used; tests register/unregister hosts
 * to inspect deliver() behavior.
 *
 * The "throws" path is covered by mocking @/lib/db so the real
 * upsertServerAgent sees a broken prisma client. We re-mock
 * @/lib/db in beforeEach so any test that overrode it doesn't leak
 * into the next test.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";
import { agentRegistry } from "@/lib/agents/registry";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  // Reset @/lib/db to the test DB so any previous test that overrode
  // it doesn't leak. Re-importing the route will pick this up.
  mock.module("@/lib/db", () => ({ db: testDB.db }));
  await testDB.db.serverAgent.deleteMany();
});

afterEach(async () => {
  for (const h of agentRegistry.connectedHostnames()) {
    agentRegistry.unregister(h);
  }
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("POST /api/agent/heartbeat", () => {
  test("upserts a new agent and returns 200", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/agent/heartbeat", {
        hostname: "alpha",
        ip_address: "10.0.0.1",
        cpu_usage: 25.5,
        memory_total: 16_000_000_000,
        memory_used: 8_000_000_000,
        version: "1.2.3",
        network_sent: 100,
        network_recv: 200,
      }),
    );
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toMatchObject({ success: true });

    const row = await testDB.db.serverAgent.findUnique({ where: { hostname: "alpha" } });
    expect(row).not.toBeNull();
    expect(row?.ipAddress).toBe("10.0.0.1");
    expect(row?.cpuUsage).toBeCloseTo(25.5);
    expect(row?.version).toBe("1.2.3");
    expect(row?.networkSent).toBe(100);
    expect(row?.networkRecv).toBe(200);
  });

  test("updates an existing agent on subsequent heartbeats", async () => {
    const { POST } = await loadRoute();
    await POST(
      jsonRequest("/api/agent/heartbeat", {
        hostname: "beta",
        version: "1.0.0",
      }),
    );
    await POST(
      jsonRequest("/api/agent/heartbeat", {
        hostname: "beta",
        version: "1.1.0",
        cpu_usage: 50,
      }),
    );

    const row = await testDB.db.serverAgent.findUnique({ where: { hostname: "beta" } });
    expect(row?.version).toBe("1.1.0");
    expect(row?.cpuUsage).toBeCloseTo(50);
  });

  test("defaults missing network fields to 0", async () => {
    const { POST } = await loadRoute();
    await POST(
      jsonRequest("/api/agent/heartbeat", {
        hostname: "gamma",
        // network_sent/network_recv omitted
      }),
    );
    const row = await testDB.db.serverAgent.findUnique({ where: { hostname: "gamma" } });
    expect(row?.networkSent).toBe(0);
    expect(row?.networkRecv).toBe(0);
  });

  test("returns 400 on invalid JSON body", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/agent/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req as never);
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid JSON body" });
  });

  test("returns 400 on validation failure (empty hostname)", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/agent/heartbeat", { hostname: "" }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 on cpu_usage out of range", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/agent/heartbeat", {
        hostname: "delta",
        cpu_usage: 150, // > 100
      }),
    );
    expect(status(res)).toBe(400);
  });

  test("returns 400 on negative memory_total", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/agent/heartbeat", {
        hostname: "epsilon",
        memory_total: -1,
      }),
    );
    expect(status(res)).toBe(400);
  });

  test("returns 500 when upsert throws", async () => {
    // Make the testDB's serverAgent.upsert throw on this call only.
    const realUpsert = testDB.db.serverAgent.upsert;
    testDB.db.serverAgent.upsert = (async () => {
      throw new Error("DB unavailable");
    }) as typeof realUpsert;
    try {
      const { POST } = await loadRoute();
      const res = await POST(
        jsonRequest("/api/agent/heartbeat", { hostname: "fail" }),
      );
      expect(status(res)).toBe(500);
      expect(await jsonBody(res)).toEqual({ error: "Failed to upsert agent" });
    } finally {
      testDB.db.serverAgent.upsert = realUpsert;
    }
  });

  test("result-less heartbeat still succeeds and skips deliver", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/agent/heartbeat", { hostname: "eta" }),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { success: true; ts: number };
    expect(body.success).toBe(true);
    expect(typeof body.ts).toBe("number");
  });

  test("an embedded 'output' result is delivered to the pending command", async () => {
    // Set up a recording ws so we can capture the commandID the
    // registry assigns.
    const recordingWs = {
      readyState: 1,
      sent: [] as string[],
      send(data: string) {
        this.sent.push(data);
      },
      close() {},
    };
    agentRegistry.register("zeta", recordingWs as never);

    const chunks: string[] = [];
    const p = agentRegistry.dispatch("zeta", "echo hi", {
      onChunk: (t) => chunks.push(t),
      timeoutMs: 5_000,
    });
    expect(recordingWs.sent).toHaveLength(1);
    const commandID = (JSON.parse(recordingWs.sent[0]) as { commandID: number }).commandID;

    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/agent/heartbeat", {
        hostname: "zeta",
        result: {
          type: "output",
          commandID,
          payload: "line1\n",
        },
      }),
    );
    expect(status(res)).toBe(200);
    expect(chunks).toEqual(["line1\n"]);

    // Complete the dispatch to keep things hermetic
    agentRegistry.deliver("zeta", { type: "exit", commandID, exitCode: 0 });
    await p;
  });

  test("an embedded 'exit' result resolves the pending dispatch", async () => {
    const recordingWs = {
      readyState: 1,
      sent: [] as string[],
      send(data: string) {
        this.sent.push(data);
      },
      close() {},
    };
    agentRegistry.register("theta", recordingWs as never);

    const p = agentRegistry.dispatch("theta", "ls", { timeoutMs: 5_000 });
    const commandID = (JSON.parse(recordingWs.sent[0]) as { commandID: number }).commandID;

    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/agent/heartbeat", {
        hostname: "theta",
        result: {
          type: "exit",
          commandID,
          exitCode: 42,
        },
      }),
    );
    expect(status(res)).toBe(200);

    const final = await p;
    expect(final.type).toBe("exit");
    expect(final.exitCode).toBe(42);
  });
});
