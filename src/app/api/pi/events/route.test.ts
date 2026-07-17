/**
 * Tests for GET /api/pi/events (singleton SSE stream).
 */
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";

let sessionUnsubscribeMock: ReturnType<typeof mock>;
let cleanupMock: ReturnType<typeof mock>;
let cancelCleanupMock: ReturnType<typeof mock>;
let capturedSubscribeCallback: ((event: unknown) => void) | null = null;
let sessionSubscribeMock: ReturnType<typeof mock>;

function makeMockProcess() {
  sessionSubscribeMock = mock((cb: (event: unknown) => void) => {
    capturedSubscribeCallback = cb;
    return sessionUnsubscribeMock;
  });
  return {
    cwd: "/tmp/test",
    subscribe: sessionSubscribeMock,
    scheduleCleanup: cleanupMock,
    cancelCleanup: cancelCleanupMock,
    exited: false,
    spawn: mock(() => undefined),
    send: mock(() => undefined),
    kill: mock(() => undefined),
  };
}

let getOrCreateMock: ReturnType<typeof mock>;
let getMock: ReturnType<typeof mock>;

beforeAll(() => {
  cleanupMock = mock(() => undefined);
  cancelCleanupMock = mock(() => undefined);
  sessionUnsubscribeMock = mock(() => undefined);
  const mockProcess = makeMockProcess();
  getOrCreateMock = mock(async () => mockProcess);
  getMock = mock(() => mockProcess);

  mock.module("@/lib/pi/process-manager", () => ({
    piProcessManager: {
      getOrCreate: getOrCreateMock,
      get: getMock,
      destroy: mock(() => undefined),
    },
  }));
});

beforeEach(() => {
  sessionUnsubscribeMock.mockClear();
  cleanupMock.mockClear();
  cancelCleanupMock.mockClear();
  getOrCreateMock.mockClear();
  capturedSubscribeCallback = null;
});

async function loadRoute(suffix: string) {
  return import(`./route.ts?bust=${Date.now()}-${suffix}`);
}

async function readFirstChunk(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  try {
    const { value, done } = await reader.read();
    if (done) return "";
    return decoder.decode(value, { stream: true });
  } finally {
    await reader.cancel().catch(() => {});
  }
}

describe("GET /api/pi/events", () => {
  test("returns 200 with text/event-stream content type", async () => {
    const { GET } = await loadRoute("content-type");
    const request = new Request("http://localhost/api/pi/events");
    // Need to mock NextRequest signal
    const res = await GET(request as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    await res.body?.cancel();
  });

  test("sends a connected event as the first SSE message", async () => {
    const { GET } = await loadRoute("connected");
    const request = new Request("http://localhost/api/pi/events");
    const res = await GET(request as any);
    const chunk = await readFirstChunk(res);

    expect(chunk).toContain("data:");
    const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
    expect(dataLine).toBeDefined();

    const json = JSON.parse(dataLine!.slice("data: ".length));
    expect(json.type).toBe("connected");
    expect(json.cwd).toBe("/tmp/test");
    expect(typeof json.timestamp).toBe("number");
  });

  test("subscribes to the singleton process event bus", async () => {
    const { GET } = await loadRoute("subscribes");
    const request = new Request("http://localhost/api/pi/events");
    const res = await GET(request as any);

    expect(getOrCreateMock).toHaveBeenCalledTimes(1);
    expect(typeof capturedSubscribeCallback).toBe("function");

    await res.body?.cancel();
  });

  test("schedules cleanup when the client disconnects", async () => {
    const { GET } = await loadRoute("cleanup");
    const controller = new AbortController();
    const request = new Request("http://localhost/api/pi/events", {
      signal: controller.signal,
    });
    const res = await GET(request as any);

    expect(getOrCreateMock).toHaveBeenCalledTimes(1);
    controller.abort();
    await new Promise((r) => setTimeout(r, 5));

    expect(sessionUnsubscribeMock).toHaveBeenCalledTimes(1);
    expect(cleanupMock).toHaveBeenCalledTimes(1);

    await res.body?.cancel();
  });
});
