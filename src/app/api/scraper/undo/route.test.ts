/**
 * Unit tests for POST /api/scraper/undo
 *
 * The route accepts either { source } (re-show the most-recently hidden
 * row for that source) or { id } (re-show a specific row).
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.scrapeResult.deleteMany();
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

async function seedHidden(opts: {
  source: string;
  title: string;
  hiddenAgoMs?: number;
}) {
  return testDB.db.scrapeResult.create({
    data: {
      source: opts.source,
      title: opts.title,
      uniqueKey: `undo-${opts.title}-${Date.now()}-${Math.random()}`,
      isHidden: true,
      isDownloaded: false,
      hiddenAt: new Date(Date.now() - (opts.hiddenAgoMs ?? 0)),
    },
  });
}

// ── POST /api/scraper/undo ───────────────────────────────────────────────

describe("POST /api/scraper/undo", () => {
  test("returns 400 on invalid JSON body", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/scraper/undo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req as never);
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid JSON body" });
  });

  test("returns 400 when neither source nor id is provided", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/undo", {}));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 when source is an unknown enum value", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/undo", {
      source: "unknown",
    }));
    expect(status(res)).toBe(400);
  });

  test("returns 400 when id is non-positive", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/undo", { id: -1 }));
    expect(status(res)).toBe(400);
  });

  test("with { source } — un-hides the most-recently hidden row for that source", async () => {
    const older = await seedHidden({ source: "141jav", title: "older", hiddenAgoMs: 60_000 });
    const newer = await seedHidden({ source: "141jav", title: "newer", hiddenAgoMs: 1000 });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/undo", {
      source: "141jav",
    }));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { success: boolean; id: number };
    expect(body.success).toBe(true);
    expect(body.id).toBe(newer.id);

    const newerAfter = await testDB.db.scrapeResult.findUnique({
      where: { id: newer.id },
    });
    expect(newerAfter?.isHidden).toBe(false);
    expect(newerAfter?.hiddenAt).toBeNull();

    // Older row stays hidden.
    const olderAfter = await testDB.db.scrapeResult.findUnique({
      where: { id: older.id },
    });
    expect(olderAfter?.isHidden).toBe(true);
  });

  test("with { source } — returns 404 when there are no hidden items to undo", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/undo", {
      source: "pornrips",
    }));
    expect(status(res)).toBe(404);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("No hidden items to undo");
  });

  test("with { id } — un-hides the specific row", async () => {
    const row = await seedHidden({ source: "projectjav", title: "target" });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/undo", { id: row.id }));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { success: boolean; id: number };
    expect(body).toEqual({ success: true, id: row.id });

    const after = await testDB.db.scrapeResult.findUnique({
      where: { id: row.id },
    });
    expect(after?.isHidden).toBe(false);
  });

  test("with { id } — returns 500 when the id doesn't exist", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/undo", { id: 99999 }));
    expect(status(res)).toBe(500);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Failed to undo hide");
  });
});
