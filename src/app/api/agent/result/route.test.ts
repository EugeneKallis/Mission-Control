/**
 * Unit tests for POST /api/agent/result
 *
 * Pure relay: takes a validated body, hands it to agentRegistry.deliver,
 * returns { success: true }. No DB, no fs.
 */

import { describe, test, expect, afterEach } from "bun:test";
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";
import { agentRegistry } from "@/lib/agents/registry";

afterEach(() => {
  for (const h of agentRegistry.connectedHostnames()) {
    agentRegistry.unregister(h);
  }
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("POST /api/agent/result", () => {
  test("relays an 'output' chunk to the pending command", async () => {
    const ws = {
      readyState: 1,
      sent: [] as string[],
      send(data: string) {
        this.sent.push(data);
      },
      close() {},
    };
    agentRegistry.register("host-r1", ws as never);

    const chunks: string[] = [];
    const p = agentRegistry.dispatch("host-r1", "cat", {
      onChunk: (t) => chunks.push(t),
      timeoutMs: 5_000,
    });
    const commandID = (JSON.parse(ws.sent[0]) as { commandID: number }).commandID;

    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/agent/result", {
        hostname: "host-r1",
        type: "output",
        commandID,
        payload: "hello\n",
      }),
    );
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
    expect(chunks).toEqual(["hello\n"]);

    // Complete the dispatch to avoid leaking the pending entry
    agentRegistry.deliver("host-r1", { type: "exit", commandID, exitCode: 0 });
    await p;
  });

  test("relays an 'exit' message and resolves the dispatch", async () => {
    const ws = {
      readyState: 1,
      sent: [] as string[],
      send(data: string) {
        this.sent.push(data);
      },
      close() {},
    };
    agentRegistry.register("host-r2", ws as never);

    const p = agentRegistry.dispatch("host-r2", "ls", { timeoutMs: 5_000 });
    const commandID = (JSON.parse(ws.sent[0]) as { commandID: number }).commandID;

    const { POST } = await loadRoute();
    await POST(
      jsonRequest("/api/agent/result", {
        hostname: "host-r2",
        type: "exit",
        commandID,
        exitCode: 42,
      }),
    );

    const final = await p;
    expect(final.type).toBe("exit");
    expect(final.exitCode).toBe(42);
  });

  test("relays an 'error' message and rejects the dispatch", async () => {
    const ws = {
      readyState: 1,
      sent: [] as string[],
      send(data: string) {
        this.sent.push(data);
      },
      close() {},
    };
    agentRegistry.register("host-r3", ws as never);

    const p = agentRegistry.dispatch("host-r3", "false", { timeoutMs: 5_000 });
    const commandID = (JSON.parse(ws.sent[0]) as { commandID: number }).commandID;

    const { POST } = await loadRoute();
    await POST(
      jsonRequest("/api/agent/result", {
        hostname: "host-r3",
        type: "error",
        commandID,
        payload: "kaboom",
      }),
    );

    await expect(p).rejects.toThrow("kaboom");
  });

  test("returns 400 on invalid JSON", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/agent/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "garbage",
    });
    const res = await POST(req as never);
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid JSON body" });
  });

  test("returns 400 on validation failure (bad type enum)", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/agent/result", {
        hostname: "host-r4",
        type: "made-up",
        commandID: 1,
      }),
    );
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 on missing hostname", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/agent/result", {
        type: "exit",
        commandID: 1,
      }),
    );
    expect(status(res)).toBe(400);
  });

  test("returns 400 on non-integer commandID", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/agent/result", {
        hostname: "host-r5",
        type: "exit",
        commandID: "abc",
      }),
    );
    expect(status(res)).toBe(400);
  });

  test("ignores results for unknown hostnames (no crash, still 200)", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/agent/result", {
        hostname: "ghost",
        type: "exit",
        commandID: 999,
        exitCode: 0,
      }),
    );
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });
  });
});
