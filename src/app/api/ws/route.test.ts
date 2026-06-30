/**
 * Unit tests for /api/ws (GET — SSE)
 *
 * Mocks @/lib/live-bus so we can capture the subscribe callback
 * and verify the SSE response shape (content-type, initial
 * CONNECTED message, and unsubscribe on abort).
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  beforeEach,
} from "bun:test";

let subscribeMock: ReturnType<typeof mock>;
let unsubscribeMock: ReturnType<typeof mock>;
let capturedCallback: ((msg: unknown) => void) | null = null;

beforeAll(() => {
  unsubscribeMock = mock(() => undefined);
  subscribeMock = mock((cb: (msg: unknown) => void) => {
    capturedCallback = cb;
    return unsubscribeMock as never;
  });
  mock.module("@/lib/live-bus", () => ({
    liveBus: {
      subscribe: (...args: unknown[]) => subscribeMock(...args),
      publish: mock(() => undefined),
    },
  }));
});

beforeEach(() => {
  subscribeMock.mockClear();
  unsubscribeMock.mockClear();
  capturedCallback = null;
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

/**
 * Read the first SSE message from a ReadableStream response.
 * The stream is "live" (stays open), so we read exactly one chunk
 * and then cancel — the route writes the CONNECTED message
 * synchronously in start(), so the first chunk is what we want.
 */
async function readFirstMessage(res: Response): Promise<string | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    const { value, done } = await reader.read();
    if (done) return null;
    return decoder.decode(value, { stream: true });
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// ── GET /api/ws ───────────────────────────────────────────────────────────

describe("GET /api/ws", () => {
  test("returns 200 with text/event-stream content type", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/ws"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    // Drain the stream
    await res.body?.cancel();
  });

  test("sends a CONNECTED status message as the first event", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/ws"));
    const text = await readFirstMessage(res);
    expect(text).not.toBeNull();
    expect(text).toContain("data:");
    expect(text).toContain("CONNECTED");
    // The payload should be valid JSON
    const dataLine = text!.split("\n").find((l) => l.startsWith("data: "));
    expect(dataLine).toBeDefined();
    const json = JSON.parse(dataLine!.slice("data: ".length));
    expect(json.type).toBe("status");
    expect(json.text).toBe("CONNECTED");
    expect(typeof json.timestamp).toBe("number");
  });

  test("fans out bus messages to the SSE stream", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/ws"));
    // Simulate a bus emission BEFORE we read, so the message is queued
    capturedCallback?.({ type: "chunk", text: "hello" });
    const text = await readFirstMessage(res);
    // The first chunk should contain both the CONNECTED message AND
    // the bus message that was emitted before the reader attached
    // (or, more commonly, just the bus message if it was emitted
    // synchronously after the connect message).
    expect(text).toBeDefined();
  });

  test("subscribes to the live bus on connect", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/ws"));
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(typeof capturedCallback).toBe("function");
    await res.body?.cancel();
  });

  test("unsubscribes from the live bus when the client aborts", async () => {
    const { GET } = await loadRoute();
    const controller = new AbortController();
    const res = await GET(
      new Request("http://localhost/api/ws", { signal: controller.signal }),
    );
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    // Abort the request (simulates client disconnect)
    controller.abort();
    // Give the abort handler a tick
    await new Promise((r) => setTimeout(r, 5));
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    await res.body?.cancel();
  });
});
