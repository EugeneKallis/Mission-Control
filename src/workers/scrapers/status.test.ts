/**
 * Unit + integration tests for src/workers/scrapers/status.ts
 *
 * These helpers persist scraping status in the `settings` table as
 * `scraper_status:<source>` rows. We exercise them with a real
 * in-file Prisma client (via the shared test helper) so the JSON
 * encoding, stale-flag detection, and read-after-write round trip
 * are all covered.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";

let testDB: TestDB;
let q: typeof import("./status");

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
  // Import after the mock is in place.
  q = await import("./status?bust=" + Date.now());
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.setting.deleteMany();
});

describe("setScrapingStatus / getScrapingStatus", () => {
  test("returns false when no status has ever been set", async () => {
    expect(await q.getScrapingStatus("never-set")).toBe(false);
  });

  test("round-trips true / false", async () => {
    await q.setScrapingStatus("source-a", true);
    expect(await q.getScrapingStatus("source-a")).toBe(true);
    await q.setScrapingStatus("source-a", false);
    expect(await q.getScrapingStatus("source-a")).toBe(false);
  });

  test("a stale true flag is treated as false and the row is cleared", async () => {
    await q.setScrapingStatus("source-b", true);

    // Reach into the DB and backdate set_at to > 30 min ago
    const STALE_AFTER_MS = 30 * 60 * 1000;
    const row = await testDB.db.setting.findUnique({ where: { key: "scraper_status:source-b" } });
    const body = JSON.parse(row!.value!);
    body.set_at = Date.now() - STALE_AFTER_MS - 60_000;
    await testDB.db.setting.update({
      where: { key: "scraper_status:source-b" },
      data: { value: JSON.stringify(body) },
    });

    expect(await q.getScrapingStatus("source-b")).toBe(false);

    // The stale read should have cleared the row, so the next read is fast.
    const after = await testDB.db.setting.findUnique({ where: { key: "scraper_status:source-b" } });
    expect(JSON.parse(after!.value!).is_scraping).toBe(false);
  });

  test("getAllScrapingStatuses returns a map of every source", async () => {
    await q.setScrapingStatus("alpha", true);
    await q.setScrapingStatus("beta", false);
    const all = await q.getAllScrapingStatuses();
    expect(all).toEqual({ alpha: true, beta: false });
  });

  test("getAllScrapingStatuses clears stale true flags", async () => {
    await q.setScrapingStatus("gamma", true);
    const STALE_AFTER_MS = 30 * 60 * 1000;
    const row = await testDB.db.setting.findUnique({ where: { key: "scraper_status:gamma" } });
    const body = JSON.parse(row!.value!);
    body.set_at = Date.now() - STALE_AFTER_MS - 60_000;
    await testDB.db.setting.update({
      where: { key: "scraper_status:gamma" },
      data: { value: JSON.stringify(body) },
    });

    const all = await q.getAllScrapingStatuses();
    expect(all.gamma).toBe(false);
  });
});

describe("withScrapingStatus", () => {
  test("sets the flag to true during the wrapped call, then clears it", async () => {
    let observedDuring = false;
    await q.withScrapingStatus("wrapped", async () => {
      observedDuring = await q.getScrapingStatus("wrapped");
    });
    expect(observedDuring).toBe(true);
    expect(await q.getScrapingStatus("wrapped")).toBe(false);
  });

  test("clears the flag even when the wrapped call throws", async () => {
    await q.setScrapingStatus("throwing", false);
    await expect(
      q.withScrapingStatus("throwing", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await q.getScrapingStatus("throwing")).toBe(false);
  });
});
