/**
 * Tests for /api/chat/sessions/[id] (GET / PATCH / DELETE).
 */
import {
  describe, test, expect, mock, beforeAll, afterAll, beforeEach,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;
let seededId: number;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.chatMessage.deleteMany();
  await testDB.db.chatSession.deleteMany();
  const s = await testDB.db.chatSession.create({
    data: { title: "S1", model: "opencode-go/deepseek-v4-flash" },
  });
  seededId = s.id;
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe("GET /api/chat/sessions/[id]", () => {
  test("returns session with messages array", async () => {
    const { GET } = await loadRoute();
    const res = await GET(undefined as never, ctx(seededId));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { id: number; title: string; messages: unknown[] };
    expect(body.id).toBe(seededId);
    expect(body.messages).toEqual([]);
  });

  test("404 for missing session", async () => {
    const { GET } = await loadRoute();
    const res = await GET(undefined as never, ctx(999_999));
    expect(status(res)).toBe(404);
  });
});

describe("PATCH /api/chat/sessions/[id]", () => {
  test("updates title + model ('session remembers its model')", async () => {
    const { PATCH } = await loadRoute();
    const res = await PATCH(
      jsonRequest(`/api/chat/sessions/${seededId}`, { title: "Renamed", model: "openai/gpt-4o" }, "PATCH"),
      ctx(seededId),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { title: string; model: string };
    expect(body.title).toBe("Renamed");
    expect(body.model).toBe("openai/gpt-4o");

    // persisted
    const fresh = await testDB.db.chatSession.findUnique({ where: { id: seededId } });
    expect(fresh?.model).toBe("openai/gpt-4o");
  });

  test("rejects unknown model with 400", async () => {
    const { PATCH } = await loadRoute();
    const res = await PATCH(
      jsonRequest(`/api/chat/sessions/${seededId}`, { model: "nope/x" }, "PATCH"),
      ctx(seededId),
    );
    expect(status(res)).toBe(400);
  });

  test("404 for missing session", async () => {
    const { PATCH } = await loadRoute();
    const res = await PATCH(
      jsonRequest(`/api/chat/sessions/999999`, { title: "x" }, "PATCH"),
      ctx(999_999),
    );
    expect(status(res)).toBe(404);
  });
});

describe("DELETE /api/chat/sessions/[id]", () => {
  test("deletes the session", async () => {
    const { DELETE } = await loadRoute();
    const res = await DELETE(undefined as never, ctx(seededId));
    expect(status(res)).toBe(200);
    expect(await testDB.db.chatSession.findUnique({ where: { id: seededId } })).toBeNull();
  });

  test("deleting cascades messages", async () => {
    await testDB.db.chatMessage.create({
      data: { sessionId: seededId, role: "user", content: "hi" },
    });
    const { DELETE } = await loadRoute();
    await DELETE(undefined as never, ctx(seededId));
    expect(await testDB.db.chatMessage.count()).toBe(0);
  });
});