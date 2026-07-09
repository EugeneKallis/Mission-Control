/**
 * Tests for /api/chat/sessions (GET + POST) — DB-backed via makeTestDB().
 */
import {
  describe, test, expect, mock, beforeAll, afterAll, beforeEach,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { getRequest, jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;

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
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("GET /api/chat/sessions", () => {
  test("returns 200 and an empty array when none exist", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual([]);
  });

  test("returns sessions newest-first", async () => {
    await testDB.db.chatSession.create({
      data: { title: "old", model: "opencode-go/deepseek-v4-flash" },
    });
    await testDB.db.chatSession.create({
      data: { title: "new", model: "opencode-go/deepseek-v4-flash" },
    });
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as { title: string }[];
    expect(body[0].title).toBe("new");
    expect(body[1].title).toBe("old");
  });
});

describe("POST /api/chat/sessions", () => {
  test("creates a session defaulting to deepseek-v4-flash", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/chat/sessions", {}));
    expect(status(res)).toBe(201);
    const body = (await jsonBody(res)) as { model: string; title: string };
    expect(body.model).toBe("opencode-go/deepseek-v4-flash");
    expect(body.title).toBe("New conversation");
  });

  test("accepts a custom title + model", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/chat/sessions", {
        title: "My chat",
        model: "openai/gpt-4o",
      }),
    );
    expect(status(res)).toBe(201);
    const body = (await jsonBody(res)) as { title: string; model: string };
    expect(body.title).toBe("My chat");
    expect(body.model).toBe("openai/gpt-4o");
  });

  test("rejects an unknown model with 400", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/chat/sessions", { model: "nope/x" }),
    );
    expect(status(res)).toBe(400);
  });

  test("rejects bad JSON with 400", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      new (await import("next/server")).NextRequest("http://localhost/api/chat/sessions", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(status(res)).toBe(400);
  });
});