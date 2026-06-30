/**
 * Unit tests for GET /api/bl-finder/counts
 *
 * Tests the per-status groupBy excludes ignored rows, totals match
 * the sum of per-status counts, and missing statuses default to 0.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { getRequest, jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.fileCheck.deleteMany();
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

interface Counts {
  broken: number;
  ok: number;
  pending: number;
  checking: number;
  total: number;
}

async function getCounts(): Promise<Counts> {
  const { GET } = await loadRoute();
  const res = await GET(getRequest("/api/bl-finder/counts"));
  expect(status(res)).toBe(200);
  return (await jsonBody(res)) as Counts;
}

async function seed(opts: {
  status: string;
  isIgnored?: boolean;
  mediaDir?: string;
}) {
  return testDB.db.fileCheck.create({
    data: {
      filePath: `/media/${opts.status}-${Math.random()}.mkv`,
      status: opts.status,
      isIgnored: opts.isIgnored ?? false,
      mediaDir: opts.mediaDir ?? "special",
    },
  });
}

describe("GET /api/bl-finder/counts", () => {
  test("returns all zeros on an empty DB", async () => {
    const c = await getCounts();
    expect(c).toEqual({ broken: 0, ok: 0, pending: 0, checking: 0, total: 0 });
  });

  test("tallies non-ignored rows by status", async () => {
    await seed({ status: "broken" });
    await seed({ status: "broken" });
    await seed({ status: "broken" });
    await seed({ status: "ok" });
    await seed({ status: "ok" });
    await seed({ status: "pending" });
    await seed({ status: "checking" });

    const c = await getCounts();
    expect(c).toEqual({
      broken: 3,
      ok: 2,
      pending: 1,
      checking: 1,
      total: 7,
    });
  });

  test("excludes ignored rows from every count", async () => {
    await seed({ status: "broken" });
    await seed({ status: "broken", isIgnored: true });
    await seed({ status: "broken", isIgnored: true });
    await seed({ status: "ok", isIgnored: true });

    const c = await getCounts();
    expect(c.broken).toBe(1);
    expect(c.ok).toBe(0);
    expect(c.total).toBe(1);
  });

  test("ignores unknown statuses (defensive — schema only allows known ones)", async () => {
    // Bypass the seed helper to insert a row with a status outside the
    // known set, in case the schema ever drifts. Counts should not
    // include it under any known key, and total should not include it.
    await testDB.db.fileCheck.create({
      data: {
        filePath: "/media/garbage.mkv",
        status: "garbage" as never,
        isIgnored: false,
        mediaDir: "special",
      },
    });
    await seed({ status: "broken" });

    const c = await getCounts();
    expect(c.broken).toBe(1);
    expect(c.total).toBe(1);
  });
});
