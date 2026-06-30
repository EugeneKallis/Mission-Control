/**
 * Unit tests for POST /api/scraper/refresh
 *
 * Clears non-downloaded rows and triggers a re-scrape:
 *   - { source } → delete rows for that source, then trigger that source
 *   - {} (no source) → delete all non-downloaded rows, then trigger
 *                       141jav + projectjav (NOT pornrips — matches Go)
 *
 * NOTE: `mock.module("@/workers/scraper-runner", ...)` is hoisted to the
 * top of the file. The DB mock for `@/lib/db` stays in `beforeAll`
 * because it needs the test DB client, which is created there.
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

// `mock.module` is hoisted to the top of the file by bun.

let triggerSourceInBackgroundMock: ReturnType<typeof mock> = mock(() => {});

const runnerState = {
  triggerSourceInBackground: (..._args: unknown[]) =>
    triggerSourceInBackgroundMock(..._args),
  triggerAllSourcesInBackground: (..._args: unknown[]) =>
    triggerSourceInBackgroundMock(..._args),
};

mock.module("@/workers/scraper-runner", () => runnerState);

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
  triggerSourceInBackgroundMock = mock(() => {});
  runnerState.triggerSourceInBackground = (..._args: unknown[]) =>
    triggerSourceInBackgroundMock(..._args);
  runnerState.triggerAllSourcesInBackground = (..._args: unknown[]) =>
    triggerSourceInBackgroundMock(..._args);
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

async function seed(opts: {
  source: string;
  title: string;
  isDownloaded?: boolean;
}) {
  return testDB.db.scrapeResult.create({
    data: {
      source: opts.source,
      title: opts.title,
      uniqueKey: `refresh-${opts.title}-${Date.now()}-${Math.random()}`,
      isDownloaded: opts.isDownloaded ?? false,
    },
  });
}

// ── POST /api/scraper/refresh ────────────────────────────────────────────

describe("POST /api/scraper/refresh", () => {
  test("returns 400 on invalid source enum value", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/refresh", {
      source: "bogus",
    }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("with { source } — deletes non-downloaded rows for that source and triggers that source", async () => {
    const a = await seed({ source: "141jav", title: "A" });
    const b = await seed({ source: "projectjav", title: "B" });
    const c = await seed({ source: "pornrips", title: "C" });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/refresh", {
      source: "141jav",
    }));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { success: boolean; source: string };
    expect(body).toEqual({ success: true, source: "141jav" });

    // The 141jav row is gone, the others remain.
    expect(
      await testDB.db.scrapeResult.findUnique({ where: { id: a.id } }),
    ).toBeNull();
    expect(
      await testDB.db.scrapeResult.findUnique({ where: { id: b.id } }),
    ).not.toBeNull();
    expect(
      await testDB.db.scrapeResult.findUnique({ where: { id: c.id } }),
    ).not.toBeNull();

    // Runner was triggered with the specific source.
    expect(triggerSourceInBackgroundMock).toHaveBeenCalledTimes(1);
    expect(triggerSourceInBackgroundMock.mock.calls[0][0]).toBe("141jav");
  });

  test("with { source } — keeps downloaded rows even for the same source", async () => {
    const downloaded = await seed({
      source: "projectjav",
      title: "downloaded",
      isDownloaded: true,
    });
    const visible = await seed({ source: "projectjav", title: "visible" });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/refresh", {
      source: "projectjav",
    }));
    expect(status(res)).toBe(200);

    // Downloaded row is kept; visible row is gone.
    expect(
      await testDB.db.scrapeResult.findUnique({ where: { id: downloaded.id } }),
    ).not.toBeNull();
    expect(
      await testDB.db.scrapeResult.findUnique({ where: { id: visible.id } }),
    ).toBeNull();
  });

  test("with no source — deletes ALL non-downloaded rows and triggers 141jav + projectjav (not pornrips)", async () => {
    const a = await seed({ source: "141jav", title: "A" });
    const b = await seed({ source: "projectjav", title: "B" });
    const c = await seed({ source: "pornrips", title: "C" });
    const downloaded = await seed({
      source: "141jav",
      title: "downloaded",
      isDownloaded: true,
    });

    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/refresh", {}));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true });

    // All non-downloaded rows are gone.
    expect(
      await testDB.db.scrapeResult.findUnique({ where: { id: a.id } }),
    ).toBeNull();
    expect(
      await testDB.db.scrapeResult.findUnique({ where: { id: b.id } }),
    ).toBeNull();
    expect(
      await testDB.db.scrapeResult.findUnique({ where: { id: c.id } }),
    ).toBeNull();
    // Downloaded rows are kept.
    expect(
      await testDB.db.scrapeResult.findUnique({ where: { id: downloaded.id } }),
    ).not.toBeNull();

    // Runner was triggered for 141jav + projectjav ONLY (not pornrips).
    expect(triggerSourceInBackgroundMock).toHaveBeenCalledTimes(2);
    const calledSources = triggerSourceInBackgroundMock.mock.calls.map(
      (c) => c[0],
    );
    expect(calledSources).toContain("141jav");
    expect(calledSources).toContain("projectjav");
    expect(calledSources).not.toContain("pornrips");
  });

  test("empty body / malformed JSON is treated as no-source (delete all, trigger two)", async () => {
    await seed({ source: "141jav", title: "A" });
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/scraper/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req as never);
    expect(status(res)).toBe(200);
    expect(triggerSourceInBackgroundMock).toHaveBeenCalledTimes(2);
  });

  test("returns 500 when the underlying delete throws", async () => {
    mock.module("@/lib/db/queries", () => ({
      deleteScrapeResultsBySource: async () => {
        throw new Error("DB unavailable");
      },
    }));
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/refresh", {
      source: "141jav",
    }));
    expect(status(res)).toBe(500);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Failed to refresh");
  });
});
