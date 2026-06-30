/**
 * Unit tests for GET /api/agent/events
 *
 * The endpoint opens an SSE stream and:
 *  1. Registers a synthetic WS in agentRegistry
 *  2. Sends an "event: hello" frame
 *  3. Forwards agentEvents.publish() frames to the stream
 *  4. Unregisters on abort
 *
 * We don't try to read the full SSE stream to completion (it never
 * ends). Instead we:
 *  - Verify the response status + headers
 *  - Read the first byte to confirm the hello frame starts
 *  - Verify the agent was registered while the stream was open
 *  - Verify the agent unregisters when the request is aborted
 */

import { describe, test, expect, afterEach } from "bun:test";
import { NextRequest } from "next/server";
import { agentRegistry } from "@/lib/agents/registry";
import { agentEvents } from "@/lib/agents/event-stream";

afterEach(() => {
  for (const h of agentRegistry.connectedHostnames()) {
    agentRegistry.unregister(h);
  }
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

function buildRequest(url: string, headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new NextRequest(url, { headers, signal });
}

describe("GET /api/agent/events", () => {
  test("returns 400 when hostname is missing", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/events"));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("hostname required");
  });

  test("returns 200 with text/event-stream content-type", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/events?hostname=alpha"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toMatch(/no-cache/);
    expect(res.headers.get("Connection")).toBe("keep-alive");

    // Cancel the stream so the test doesn't hang
    await res.body?.cancel();
  });

  test("sends an 'event: hello' frame as the first bytes", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/events?hostname=beta"));
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    reader.cancel().catch(() => {});
    const text = decoder.decode(value);
    expect(text).toContain("event: hello");
    expect(text).toContain('"hostname":"beta"');
  });

  test("registers the agent in the registry while the stream is open", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/events?hostname=gamma"));

    // The route registers synchronously inside stream.start(). We have
    // to wait for the microtask to flush before we can read the body
    // chunk; reading also confirms the stream is alive.
    const reader = res.body!.getReader();
    await reader.read();

    expect(agentRegistry.isConnected("gamma")).toBe(true);
    expect(agentRegistry.getIp("gamma")).toBeUndefined();

    reader.cancel().catch(() => {});
  });

  test("captures the X-Forwarded-For IP", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/agent/events?hostname=delta", {
        "x-forwarded-for": "203.0.113.5, 10.0.0.1",
      }),
    );
    const reader = res.body!.getReader();
    await reader.read();

    expect(agentRegistry.getIp("delta")).toBe("203.0.113.5");

    reader.cancel().catch(() => {});
  });

  test("captures X-Real-IP when X-Forwarded-For is absent", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/agent/events?hostname=epsilon", {
        "x-real-ip": "198.51.100.7",
      }),
    );
    const reader = res.body!.getReader();
    await reader.read();

    expect(agentRegistry.getIp("epsilon")).toBe("198.51.100.7");

    reader.cancel().catch(() => {});
  });

  test("forwards agentEvents.publish() data as 'data:' frames", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/events?hostname=zeta"));
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Drain the hello frame first
    const { value: hello } = await reader.read();
    const helloText = decoder.decode(hello);
    expect(helloText).toContain("event: hello");

    // Publish a command via the event bus
    agentEvents.publish("zeta", { type: "exec", command: "ls", commandID: 1 });

    // Next chunk should contain the published data
    const { value: cmd } = await reader.read();
    const cmdText = decoder.decode(cmd);
    expect(cmdText).toContain("data:");
    expect(cmdText).toContain('"type":"exec"');
    expect(cmdText).toContain('"command":"ls"');

    reader.cancel().catch(() => {});
  });

  test("unregisters the agent when the request is aborted", async () => {
    const controller = new AbortController();
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/agent/events?hostname=eta", {}, controller.signal),
    );
    const reader = res.body!.getReader();
    await reader.read(); // flush hello

    expect(agentRegistry.isConnected("eta")).toBe(true);

    controller.abort();

    // Give the abort listener a tick to run
    await new Promise((r) => setTimeout(r, 10));
    expect(agentRegistry.isConnected("eta")).toBe(false);

    reader.cancel().catch(() => {});
  });
});
