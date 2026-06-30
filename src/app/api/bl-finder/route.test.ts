/**
 * Unit tests for GET /api/bl-finder
 *
 * Uses a real temp-file Prisma + libsql DB. mock.module("@/lib/db", …)
 * swaps the dev singleton for the test client, and the `?bust=`
 * re-import forces the route to use the mocked module.
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

async function seedRow(p: { filePath: string; status?: string; mediaDir?: string | null }) {
  return testDB.db.fileCheck.create({
    data: {
      filePath: p.filePath,
      status: p.status ?? "pending",
      mediaDir: p.mediaDir ?? "special",
    },
  });
}

describe("GET /api/bl-finder", () => {
  test("returns rows, total, and counts", async () => {
    await seedRow({ filePath: "/m/a.mkv", status: "ok" });
    await seedRow({ filePath: "/m/b.mkv", status: "broken" });
    await seedRow({ filePath: "/m/c.mkv", status: "pending" });

    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/bl-finder"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      rows: { id: number; filePath: string; status: string }[];
      total: number;
      counts: Record<string, number>;
    };
    expect(body.total).toBe(3);
    expect(body.rows).toHaveLength(3);
    expect(body.counts.ok).toBe(1);
    expect(body.counts.broken).toBe(1);
    expect(body.counts.pending).toBe(1);
  });

  test("filters by status", async () => {
    await seedRow({ filePath: "/m/a.mkv", status: "ok" });
    await seedRow({ filePath: "/m/b.mkv", status: "broken" });

    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/bl-finder?status=broken"));
    const body = (await jsonBody(res)) as { rows: { status: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.rows[0].status).toBe("broken");
  });

  test("filters by mediaDir", async () => {
    await seedRow({ filePath: "/m/a.mkv", mediaDir: "movies" });
    await seedRow({ filePath: "/m/b.mkv", mediaDir: "special" });

    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/bl-finder?mediaDir=movies"));
    const body = (await jsonBody(res)) as { rows: { mediaDir: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.rows[0].mediaDir).toBe("movies");
  });

  test("filters by search (substring on filePath)", async () => {
    await seedRow({ filePath: "/media/movies/foo.mkv" });
    await seedRow({ filePath: "/media/special/bar.mkv" });

    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/bl-finder?search=foo"));
    const body = (await jsonBody(res)) as { rows: { filePath: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.rows[0].filePath).toContain("foo");
  });

  test("excludes ignored rows from the default list", async () => {
    await seedRow({ filePath: "/m/a.mkv" });
    await seedRow({ filePath: "/m/b.mkv" });
    await testDB.db.fileCheck.update({
      where: { filePath: "/m/a.mkv" },
      data: { isIgnored: true },
    });

    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/bl-finder"));
    const body = (await jsonBody(res)) as { rows: { filePath: string }[] };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].filePath).toBe("/m/b.mkv");
  });

  test("respects limit and offset", async () => {
    for (let i = 0; i < 5; i++) {
      await seedRow({ filePath: `/m/${i}.mkv` });
    }

    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/bl-finder?limit=2&offset=1"));
    const body = (await jsonBody(res)) as { rows: { filePath: string }[]; total: number };
    expect(body.rows).toHaveLength(2);
    expect(body.total).toBe(5);
  });

  test("returns 500 on DB error (findMany throws)", async () => {
    // Make the next query throw.
    const orig = testDB.db.fileCheck.findMany;
    testDB.db.fileCheck.findMany = (() => {
      throw new Error("DB down");
    }) as typeof testDB.db.fileCheck.findMany;
    try {
      const { GET } = await loadRoute();
      const res = await GET(getRequest("/api/bl-finder"));
      expect(status(res)).toBe(500);
    } finally {
      testDB.db.fileCheck.findMany = orig;
    }
  });
});
