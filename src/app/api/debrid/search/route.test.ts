/**
 * Unit tests for /api/debrid/search (GET)
 *
 * The route forwards to searchDebridFiles(q, 200) and short-circuits to
 * an empty array when q is empty/whitespace. We use a real test DB so
 * the SQL `contains` filter is exercised.
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
  await testDB.db.debridFile.deleteMany();
});

async function loadRoute(suffix: string) {
  return import(`./route?bust=${Date.now()}-${suffix}`);
}

async function seedFile(path: string, name: string, parentPath: string, isDir = false) {
  return testDB.db.debridFile.create({ data: { path, name, parentPath, isDir } });
}

describe("GET /api/debrid/search", () => {
  test("returns an empty array when q is missing", async () => {
    const { GET } = await loadRoute("missing");
    const res = await GET(getRequest("/api/debrid/search"));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual([]);
  });

  test("returns an empty array when q is empty string", async () => {
    const { GET } = await loadRoute("empty");
    const res = await GET(getRequest("/api/debrid/search?q="));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual([]);
  });

  test("returns an empty array when q is whitespace only", async () => {
    const { GET } = await loadRoute("ws");
    const res = await GET(getRequest("/api/debrid/search?q=%20%20%20"));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual([]);
  });

  test("returns files whose name contains the query", async () => {
    await seedFile("/a/alpha", "alpha.txt", "/a");
    await seedFile("/a/beta", "beta.txt", "/a");
    await seedFile("/a/alphaville", "alphaville.txt", "/a");

    const { GET } = await loadRoute("match");
    const res = await GET(getRequest("/api/debrid/search?q=alpha"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Array<{ name: string; path: string }>;
    const names = body.map((b) => b.name).sort();
    expect(names).toEqual(["alpha.txt", "alphaville.txt"]);
  });

  test("trims whitespace around the query before searching", async () => {
    await seedFile("/x/match-me", "match-me.txt", "/x");
    await seedFile("/x/other", "other.txt", "/x");

    const { GET } = await loadRoute("trim");
    const res = await GET(getRequest("/api/debrid/search?q=%20%20match%20%20"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Array<{ name: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("match-me.txt");
  });

  test("returns 500 when the DB query throws", async () => {
    mock.module("@/lib/db/queries", () => ({
      searchDebridFiles: async () => {
        throw new Error("DB down");
      },
    }));
    const { GET } = await loadRoute("throw");
    const res = await GET(getRequest("/api/debrid/search?q=foo"));
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to search debrid files" });
  });
});
