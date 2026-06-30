/**
 * Unit tests for /api/nzb/search (GET)
 *
 * Symmetric to /api/debrid/search. Forwards to searchNzbFiles(q, 200)
 * and short-circuits to an empty array when q is empty/whitespace.
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
  await testDB.db.nzbFile.deleteMany();
});

async function loadRoute(suffix: string) {
  return import(`./route?bust=${Date.now()}-${suffix}`);
}

async function seedFile(path: string, name: string, parentPath: string, isDir = false) {
  return testDB.db.nzbFile.create({ data: { path, name, parentPath, isDir } });
}

describe("GET /api/nzb/search", () => {
  test("returns an empty array when q is missing", async () => {
    const { GET } = await loadRoute("missing");
    const res = await GET(getRequest("/api/nzb/search"));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual([]);
  });

  test("returns an empty array when q is empty string", async () => {
    const { GET } = await loadRoute("empty");
    const res = await GET(getRequest("/api/nzb/search?q="));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual([]);
  });

  test("returns an empty array when q is whitespace only", async () => {
    const { GET } = await loadRoute("ws");
    const res = await GET(getRequest("/api/nzb/search?q=%20%20%20"));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual([]);
  });

  test("returns files whose name contains the query", async () => {
    await seedFile("/a/episode-one", "episode-one.nzb", "/a");
    await seedFile("/a/episode-two", "episode-two.nzb", "/a");
    await seedFile("/a/extra", "extra.nzb", "/a");

    const { GET } = await loadRoute("match");
    const res = await GET(getRequest("/api/nzb/search?q=episode"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Array<{ name: string }>;
    const names = body.map((b) => b.name).sort();
    expect(names).toEqual(["episode-one.nzb", "episode-two.nzb"]);
  });

  test("trims whitespace around the query before searching", async () => {
    await seedFile("/x/hit", "hit.nzb", "/x");
    await seedFile("/x/no", "no.nzb", "/x");

    const { GET } = await loadRoute("trim");
    const res = await GET(getRequest("/api/nzb/search?q=%20%20hit%20%20"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Array<{ name: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("hit.nzb");
  });

  test("returns 500 when the DB query throws", async () => {
    mock.module("@/lib/db/queries", () => ({
      searchNzbFiles: async () => {
        throw new Error("DB down");
      },
    }));
    const { GET } = await loadRoute("throw");
    const res = await GET(getRequest("/api/nzb/search?q=foo"));
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to search NZB files" });
  });
});
