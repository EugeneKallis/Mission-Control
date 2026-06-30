/**
 * Unit tests for /api/nzb/tree (GET)
 *
 * Symmetric to /api/debrid/tree. Branches on `parent` query param:
 *   - empty/missing → getNzbRootFiles()
 *   - present      → getNzbChildren(parent)
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

describe("GET /api/nzb/tree", () => {
  test("returns root files when parent is empty", async () => {
    await seedFile("/a", "a", "", true);
    await seedFile("/b", "b", "", true);
    await seedFile("/a/inside", "inside", "/a", false);

    const { GET } = await loadRoute("roots");
    const res = await GET(getRequest("/api/nzb/tree"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Array<{ name: string; parentPath: string }>;
    expect(body).toHaveLength(2);
    expect(body.every((f) => f.parentPath === "")).toBe(true);
  });

  test("returns children for a non-empty parent", async () => {
    await seedFile("/p", "p", "", true);
    await seedFile("/p/child1", "child1", "/p", false);
    await seedFile("/p/child2", "child2", "/p", true);
    await seedFile("/other/x", "x", "/other", false);

    const { GET } = await loadRoute("children");
    const res = await GET(getRequest("/api/nzb/tree?parent=%2Fp"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Array<{ name: string; parentPath: string }>;
    const names = body.map((b) => b.name).sort();
    expect(names).toEqual(["child1", "child2"]);
  });

  test("returns 500 when the DB query throws", async () => {
    mock.module("@/lib/db/queries", () => ({
      getNzbRootFiles: async () => {
        throw new Error("DB down");
      },
    }));
    const { GET } = await loadRoute("throw");
    const res = await GET(getRequest("/api/nzb/tree"));
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to fetch NZB tree" });
  });
});
