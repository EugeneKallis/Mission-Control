/**
 * Tests for GET/PUT /api/pi/state (singleton Pi process).
 */
import { describe, test, expect, mock, beforeAll, beforeEach } from "bun:test";

const mockSendAndWait = mock();

beforeAll(() => {
  mock.module("@/lib/pi/process-manager", () => ({
    piProcessManager: {
      getOrCreate: mock(async () => ({
        sendAndWait: mockSendAndWait,
        exited: false,
      })),
    },
  }));
});

beforeEach(() => {
  mockSendAndWait.mockReset();
});

async function loadRoute(suffix: string) {
  return import(`./route.ts?bust=${Date.now()}-${suffix}`);
}

describe("GET /api/pi/state", () => {
  test("returns models, stats, and state on success", async () => {
    mockSendAndWait
      .mockReturnValueOnce(Promise.resolve({ type: "response", command: "get_available_models", success: true, data: { models: [{ id: "test/model", name: "Test Model" }] } }))
      .mockReturnValueOnce(Promise.resolve({ type: "response", command: "get_session_stats", success: true, data: { messageCount: 5 } }))
      .mockReturnValueOnce(Promise.resolve({ type: "response", command: "get_state", success: true, data: { model: "test/model", thinkingLevel: "medium" } }));

    const { GET } = await loadRoute("success");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.models)).toBe(true);
    expect((body.models as Array<unknown>).length).toBe(1);
    expect(body.stats).toBeTruthy();
    expect(body.state).toBeTruthy();
  });

  test("handles sendAndWait failure gracefully", async () => {
    mockSendAndWait.mockRejectedValue(new Error("connection lost"));
    const { GET } = await loadRoute("failure");
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/pi/state", () => {
  test("returns 400 for invalid JSON", async () => {
    const { PUT } = await loadRoute("put-invalid");
    const req = new Request("http://localhost/api/pi/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await PUT(req as any);
    expect(res.status).toBe(400);
  });

  test("sets model successfully", async () => {
    mockSendAndWait.mockResolvedValue({ type: "response", command: "set_model", success: true });
    const { PUT } = await loadRoute("put-model");
    const req = new Request("http://localhost/api/pi/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modelId: "deepseek-v4-flash", provider: "opencode-go" }),
    });
    const res = await PUT(req as any);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  test("sets thinking level successfully", async () => {
    mockSendAndWait.mockResolvedValue({ type: "response", command: "set_thinking_level", success: true });
    const { PUT } = await loadRoute("put-thinking");
    const req = new Request("http://localhost/api/pi/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thinkingLevel: "high" }),
    });
    const res = await PUT(req as any);
    expect(res.status).toBe(200);
  });

  test("returns error for invalid thinking level", async () => {
    const { PUT } = await loadRoute("put-invalid-thinking");
    const req = new Request("http://localhost/api/pi/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thinkingLevel: "extreme" }),
    });
    const res = await PUT(req as any);
    expect(res.status).toBe(400);
  });

  test("requires provider when modelId is set", async () => {
    const { PUT } = await loadRoute("put-no-provider");
    const req = new Request("http://localhost/api/pi/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modelId: "some-model" }),
    });
    const res = await PUT(req as any);
    expect(res.status).toBe(400);
  });
});
