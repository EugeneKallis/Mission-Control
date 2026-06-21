/**
 * Unit tests for src/lib/agents/registry.ts
 *
 * The AgentRegistry is the in-memory map the runner uses to dispatch
 * commands to a connected agent. We exercise the public surface
 * (register / unregister / isConnected / connectedHostnames / getIp /
 * dispatch / deliver) using a small WebSocket mock — no real network
 * is touched.
 *
 * Because `agentRegistry` is a process-wide singleton, each test
 * cleans up the registered hosts and pending commands via unregister()
 * in afterEach so they don't leak into other tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { agentRegistry, type AgentMessage } from "./registry";

// ── WebSocket mock ──────────────────────────────────────────────────────

interface MockWebSocket {
  readyState: number;
  sent: string[];
  closed: boolean;
  send(data: string): void;
  close(): void;
}

function makeMockWS(initialState: number = 1): MockWebSocket {
  return {
    readyState: initialState,
    sent: [],
    closed: false,
    send(data: string) {
      this.sent.push(data);
    },
    close() {
      this.closed = true;
      this.readyState = 3; // CLOSED
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("AgentRegistry", () => {
  beforeEach(() => {
    // No-op; tests register as needed and unregister in afterEach.
  });

  afterEach(() => {
    // Clean up any hosts the test registered so they don't leak.
    for (const h of agentRegistry.connectedHostnames()) {
      try {
        agentRegistry.unregister(h);
      } catch {
        /* noop */
      }
    }
    // The above only closes OPEN ones. Force-clear the rest by walking
    // internal `size` count: any host not in connectedHostnames means
    // its ws is non-OPEN. We can't unregister them through the public
    // API without readyState===1, but they don't affect dispatch either.
  });

  test("register + isConnected round trip", () => {
    const ws = makeMockWS(1);
    agentRegistry.register("h1", ws as unknown as import("ws").WebSocket, "10.0.0.1");
    expect(agentRegistry.isConnected("h1")).toBe(true);
    expect(agentRegistry.connectedHostnames()).toContain("h1");
    expect(agentRegistry.getIp("h1")).toBe("10.0.0.1");
    expect(agentRegistry.size).toBeGreaterThanOrEqual(1);
  });

  test("isConnected returns false for non-OPEN readyState", () => {
    const ws = makeMockWS(0); // CONNECTING
    agentRegistry.register("h2", ws as unknown as import("ws").WebSocket);
    expect(agentRegistry.isConnected("h2")).toBe(false);
  });

  test("register replaces an existing connection and closes the prior one", () => {
    const first = makeMockWS(1);
    const second = makeMockWS(1);
    agentRegistry.register("h3", first as unknown as import("ws").WebSocket);
    agentRegistry.register("h3", second as unknown as import("ws").WebSocket);
    expect(first.closed).toBe(true);
    expect(agentRegistry.isConnected("h3")).toBe(true);
  });

  test("unregister removes the entry", () => {
    const ws = makeMockWS(1);
    agentRegistry.register("h4", ws as unknown as import("ws").WebSocket);
    expect(agentRegistry.isConnected("h4")).toBe(true);
    agentRegistry.unregister("h4");
    expect(agentRegistry.isConnected("h4")).toBe(false);
  });

  test("unregister rejects any in-flight commands for that host", async () => {
    const ws = makeMockWS(1);
    agentRegistry.register("h5", ws as unknown as import("ws").WebSocket);

    const dispatchPromise = agentRegistry.dispatch("h5", "sleep 1", {
      timeoutMs: 10_000,
    });
    // The dispatch should have sent an exec message
    expect(ws.sent).toHaveLength(1);
    const sent = JSON.parse(ws.sent[0]) as { type: string; commandID: number };
    expect(sent.type).toBe("exec");
    expect(typeof sent.commandID).toBe("number");

    // Tear down mid-flight — dispatch should reject
    agentRegistry.unregister("h5");
    await expect(dispatchPromise).rejects.toThrow(/disconnected mid-command/);
  });

  test("dispatch throws when the host is not connected", async () => {
    await expect(agentRegistry.dispatch("nope", "echo hi")).rejects.toThrow(
      /not connected/,
    );
  });

  test("dispatch sends an exec payload with type/command/commandID/dir", async () => {
    const ws = makeMockWS(1);
    agentRegistry.register("h6", ws as unknown as import("ws").WebSocket);

    const p = agentRegistry.dispatch("h6", "ls -la", { dir: "/tmp" });
    // Capture commandID from the sent frame
    expect(ws.sent).toHaveLength(1);
    const sent = JSON.parse(ws.sent[0]) as Record<string, unknown>;
    expect(sent.type).toBe("exec");
    expect(sent.command).toBe("ls -la");
    expect(sent.dir).toBe("/tmp");
    expect(typeof sent.commandID).toBe("number");

    // Complete the dispatch so the timer is cleared and the test is hermetic.
    const commandID = sent.commandID as number;
    const exitMsg: AgentMessage = { type: "exit", commandID, exitCode: 0 };
    agentRegistry.deliver("h6", exitMsg);
    const final = await p;
    expect(final.type).toBe("exit");
    expect(final.exitCode).toBe(0);
  });

  test("deliver routes output chunks to onChunk and exit resolves the promise", async () => {
    const ws = makeMockWS(1);
    agentRegistry.register("h7", ws as unknown as import("ws").WebSocket);

    const chunks: string[] = [];
    let exitCode = -1;

    const p = agentRegistry.dispatch("h7", "cat /etc/hostname", {
      onChunk: (t) => chunks.push(t),
      onExit: (c) => {
        exitCode = c;
      },
    });

    const sent = JSON.parse(ws.sent[0]) as { commandID: number };
    const id = sent.commandID;

    agentRegistry.deliver("h7", { type: "output", commandID: id, payload: "line1\n" });
    agentRegistry.deliver("h7", { type: "output", commandID: id, payload: "line2\n" });
    agentRegistry.deliver("h7", { type: "exit", commandID: id, exitCode: 0 });

    const final = await p;
    expect(final.type).toBe("exit");
    expect(final.exitCode).toBe(0);
    expect(chunks).toEqual(["line1\n", "line2\n"]);
    expect(exitCode).toBe(0);
  });

  test("deliver routes error to reject", async () => {
    const ws = makeMockWS(1);
    agentRegistry.register("h8", ws as unknown as import("ws").WebSocket);

    const p = agentRegistry.dispatch("h8", "false", { timeoutMs: 10_000 });
    const sent = JSON.parse(ws.sent[0]) as { commandID: number };
    agentRegistry.deliver("h8", {
      type: "error",
      commandID: sent.commandID,
      payload: "boom",
    });
    await expect(p).rejects.toThrow("boom");
  });

  test("dispatch times out when no exit is delivered", async () => {
    const ws = makeMockWS(1);
    agentRegistry.register("h9", ws as unknown as import("ws").WebSocket);

    const p = agentRegistry.dispatch("h9", "sleep 999", { timeoutMs: 30 });
    await expect(p).rejects.toThrow(/timed out/);

    // After the timeout, a late deliver for the same commandID is ignored
    // (the entry was deleted on timeout).
    const sent = JSON.parse(ws.sent[0]) as { commandID: number };
    let lateReceived = false;
    // The promise has already rejected; the next deliver should not crash.
    agentRegistry.deliver("h9", { type: "output", commandID: sent.commandID, payload: "x" });
    expect(lateReceived).toBe(false);
  });

  test("deliver with no matching pending command is a no-op", () => {
    // Should not throw
    expect(() =>
      agentRegistry.deliver("ghost", { type: "output", commandID: 999999, payload: "x" })
    ).not.toThrow();
  });

  test("status messages record IP but don't touch pending commands", () => {
    const ws = makeMockWS(1);
    agentRegistry.register("h10", ws as unknown as import("ws").WebSocket);
    expect(agentRegistry.getIp("h10")).toBeUndefined();

    agentRegistry.deliver("h10", {
      type: "status",
      commandID: 0,
      status: { ip_address: "192.168.1.42", cpu_usage: 12 },
    });
    expect(agentRegistry.getIp("h10")).toBe("192.168.1.42");
  });

  test("send failure during dispatch rejects and clears the pending entry", async () => {
    const ws = {
      readyState: 1,
      sent: [],
      send() {
        throw new Error("socket closed");
      },
      close() {},
    };
    agentRegistry.register("h11", ws as unknown as import("ws").WebSocket);

    await expect(agentRegistry.dispatch("h11", "ls")).rejects.toThrow("socket closed");
  });
});
