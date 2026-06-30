/**
 * Unit tests for POST /api/scraper/hide-all
 *
 * Hides every visible result, optionally scoped to a single source.
 * Empty body is allowed (hide everything).
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

async function seed(opts: {
  source: string;
  title: string;
  isHidden?: boolean;
  isDownloaded?: boolean;
}) {
  return testDB.db.scrapeResult.create({
    data: {
      source: opts.source,
      title: opts.title,
      uniqueKey: `hideall-${opts.title}-${Date.now()}-${Math.random()}`,
      isHidden: opts.isHidden ?? false,
      isDownloaded: opts.isDownloaded ?? false,
    },
  });
}

// ── POST /api/scraper/hide-all ───────────────────────────────────────────

describe("POST /api/scraper/hide-all", () => {
  test("returns 400 on invalid source enum value", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/hide-all", {
      source: "not-a-source",
    }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("hides every visible row when no source is specified", async () => {
    await seed({ source: "141jav", title: "A" });
    await seed({ source: "projectjav", title: "B" });
    await seed({ source: "pornrips", title: "C" });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/hide-all", {}));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      success: boolean;
      hidden: number;
    };
    expect(body.success).toBe(true);
    expect(body.hidden).toBe(3);

    const remaining = await testDB.db.scrapeResult.count({
      where: { isHidden: false },
    });
    expect(remaining).toBe(0);
  });

  test("empty body is treated as hide-all (no source)", async () => {
    await seed({ source: "141jav", title: "A" });
    await seed({ source: "projectjav", title: "B" });
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/scraper/hide-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req as never);
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { hidden: number };
    expect(body.hidden).toBe(2);
  });

  test("hides only rows for the given source when source is specified", async () => {
    const a = await seed({ source: "141jav", title: "A" });
    const b = await seed({ source: "projectjav", title: "B" });
    const c = await seed({ source: "pornrips", title: "C" });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/hide-all", {
      source: "projectjav",
    }));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      success: boolean;
      hidden: number;
      source: string;
    };
    expect(body).toEqual({
      success: true,
      hidden: 1,
      source: "projectjav",
    });

    const aAfter = await testDB.db.scrapeResult.findUnique({
      where: { id: a.id },
    });
    const bAfter = await testDB.db.scrapeResult.findUnique({
      where: { id: b.id },
    });
    const cAfter = await testDB.db.scrapeResult.findUnique({
      where: { id: c.id },
    });
    expect(aAfter?.isHidden).toBe(false);
    expect(bAfter?.isHidden).toBe(true);
    expect(cAfter?.isHidden).toBe(false);
  });

  test("does not re-hide already-hidden rows (count is only newly hidden)", async () => {
    await seed({ source: "141jav", title: "Visible" });
    await seed({ source: "141jav", title: "Already hidden", isHidden: true });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/hide-all", {}));
    const body = (await jsonBody(res)) as { hidden: number };
    expect(body.hidden).toBe(1);
  });

  test("returns 500 when the underlying updateMany throws", async () => {
    mock.module("@/lib/db/queries", () => ({
      hideAllScrapeResults: async () => {
        throw new Error("DB unavailable");
      },
    }));
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/hide-all", {}));
    expect(status(res)).toBe(500);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Failed to hide all");
  });
});
