/**
 * Tests for POST /api/chat/sessions/[id]/messages.
 * DB is mocked via makeTestDB(); the provider layer is mocked so no network.
 */
import {
  describe, test, expect, mock, beforeAll, afterAll, beforeEach,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;
let seededId: number;

let callProviderMock: ReturnType<typeof mock>;
let providerErrorToResponse: (e: unknown) => Response;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
  // Mock the provider call so no network is touched.
  callProviderMock = mock(async () => "assistant reply");
  providerErrorToResponse = (e: unknown) =>
    new Response(JSON.stringify({ error: e instanceof Error ? e.message : "err" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  mock.module("@/lib/chat/provider", () => ({
    callProvider: callProviderMock,
    providerErrorToResponse,
    ProviderError: class ProviderError extends Error {},
  }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  callProviderMock.mockImplementation(async () => "assistant reply");
  await testDB.db.chatMessage.deleteMany();
  await testDB.db.chatSession.deleteMany();
  const s = await testDB.db.chatSession.create({
    data: { title: "S", model: "opencode-go/deepseek-v4-flash" },
  });
  seededId = s.id;
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

async function send(body: unknown, id = seededId) {
  const { POST } = await loadRoute();
  return POST(
    jsonRequest(`/api/chat/sessions/${id}/messages`, body),
    ctx(id),
  );
}

describe("POST /api/chat/sessions/[id]/messages", () => {
  test("persists user + assistant messages and returns them", async () => {
    const res = await send({ content: "hello" });
    expect(status(res)).toBe(201);
    const body = (await jsonBody(res)) as { userMessage: { content: string }; assistantMessage: { content: string } };
    expect(body.userMessage.content).toBe("hello");
    expect(body.assistantMessage.content).toBe("assistant reply");

    const msgs = await testDB.db.chatMessage.findMany({ orderBy: { id: "asc" } });
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
  });

  test("passes the session's model to the provider", async () => {
    await testDB.db.chatSession.update({
      where: { id: seededId },
      data: { model: "openai/gpt-4o" },
    });
    await send({ content: "with vision" });
    const arg = callProviderMock.mock.calls.at(-1)![0] as { model: { id: string }; messages: { role: string; content: string; images?: string[] }[] };
    expect(arg.model.id).toBe("openai/gpt-4o");
    expect(arg.messages[0].role).toBe("system");
    expect(arg.messages.at(-1)!.content).toBe("with vision");
  });

  test("rejects image attachment against a text-only model with 400", async () => {
    const res = await send({
      content: "look",
      attachments: [{ name: "p.png", mimeType: "image/png", size: 1000, kind: "image", dataUrl: "data:image/png;base64,AAAA" }],
    });
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toContain("images");
  });

  test("accepts text attachment against the text-only default model", async () => {
    const res = await send({
      content: "review",
      attachments: [{ name: "app.ts", mimeType: "text/typescript", size: 40, kind: "text", text: "console.log(1)" }],
    });
    expect(status(res)).toBe(201);
    const arg = callProviderMock.mock.calls.at(-1)![0] as { messages: { content: string }[] };
    expect(arg.messages.at(-1)!.content).toContain("### File: app.ts");
    expect(arg.messages.at(-1)!.content).toContain("console.log(1)");
  });

  test("persists an error assistant turn when the provider throws", async () => {
    callProviderMock.mockImplementation(async () => {
      throw new Error("boom");
    });
    const res = await send({ content: "hi" });
    const body = (await jsonBody(res)) as { assistantMessage: { content: string }; error: string };
    expect(body.assistantMessage.content).toContain("boom");
    expect(body.error).toBe("boom");
    const msgs = await testDB.db.chatMessage.findMany();
    expect(msgs.length).toBe(2); // user + error turn
  });

  test("404 for missing session", async () => {
    const res = await send({ content: "x" }, 999_999);
    expect(status(res)).toBe(404);
  });

  test("rejects empty content with 400", async () => {
    const res = await send({ content: "" });
    expect(status(res)).toBe(400);
  });
});