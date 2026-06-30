/**
 * Unit tests for POST /api/scraper/hide
 *
 * The route hides a single scrape result by id. We use the real DB
 * via makeTestDB so the update is verifiable.
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

async function seedVisible() {
  return testDB.db.scrapeResult.create({
    data: {
      source: "141jav",
      title: "To be hidden",
      uniqueKey: `hide-test-${Date.now()}-${Math.random()}`,
      isHidden: false,
    },
  });
}

// ── POST /api/scraper/hide ───────────────────────────────────────────────

describe("POST /api/scraper/hide", () => {
  test("returns 400 on invalid JSON body", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/scraper/hide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req as never);
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid JSON body" });
  });

  test("returns 400 on missing id", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/hide", {}));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 on non-positive id", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/hide", { id: 0 }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 on non-integer id", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/hide", {
      id: 1.5,
    }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("hides the row and returns success on the happy path", async () => {
    const row = await seedVisible();
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/hide", { id: row.id }));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      success: boolean;
      id: number;
    };
    expect(body).toEqual({ success: true, id: row.id });

    const after = await testDB.db.scrapeResult.findUnique({
      where: { id: row.id },
    });
    expect(after?.isHidden).toBe(true);
    expect(after?.hiddenAt).toBeInstanceOf(Date);
  });

  test("returns 500 when hideScrapeResult throws (e.g. unknown id)", async () => {
    const { POST } = await loadRoute();
    // id 99999 doesn't exist; findUniqueOrThrow / update throws.
    const res = await POST(jsonRequest("/api/scraper/hide", { id: 99999 }));
    expect(status(res)).toBe(500);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Failed to hide");
  });
});
