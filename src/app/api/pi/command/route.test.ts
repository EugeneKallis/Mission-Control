/**
 * Tests for POST /api/pi/command (singleton Pi process).
 */
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";

const mockSend = mock();

beforeAll(() => {
  mock.module("@/lib/pi/process-manager", () => ({
    piProcessManager: {
      getOrCreate: mock(async () => ({
        send: mockSend,
        exited: false,
      })),
    },
  }));
});

beforeEach(() => {
  mockSend.mockClear();
});

async function loadRoute(suffix: string) {
  return import(`./route.ts?bust=${Date.now()}-${suffix}`);
}

describe("POST /api/pi/command", () => {
  test("returns 400 for invalid JSON", async () => {
    const { POST } = await loadRoute("invalid-json");
    const req = new Request("http://localhost/api/pi/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test("returns 400 for missing type", async () => {
    const { POST } = await loadRoute("missing-type");
    const req = new Request("http://localhost/api/pi/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test("returns 400 for unknown command type", async () => {
    const { POST } = await loadRoute("unknown-type");
    const req = new Request("http://localhost/api/pi/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "unknown_thing" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test("returns 400 for prompt without message", async () => {
    const { POST } = await loadRoute("no-message");
    const req = new Request("http://localhost/api/pi/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "prompt" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  test("returns 200 for valid prompt command", async () => {
    const { POST } = await loadRoute("valid-prompt");
    const req = new Request("http://localhost/api/pi/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "prompt", message: "hello" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith({ type: "prompt", message: "hello" });
  });

  test("returns 200 for valid abort command", async () => {
    const { POST } = await loadRoute("valid-abort");
    const req = new Request("http://localhost/api/pi/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "abort" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith({ type: "abort" });
  });
});
