/**
 * Unit tests for /api/nzb/delete (POST)
 *
 * Symmetric to /api/debrid/delete. Validates { paths: string[].min(1) }
 * with zod, expands parents via getNzbChildren(p, 100000), rm-forces each
 * path, then deleteNzbByPaths returns the row count.
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
  await testDB.db.nzbFile.deleteMany();
});

async function loadRoute(suffix: string) {
  return import(`./route?bust=${Date.now()}-${suffix}`);
}

async function seedFile(path: string, name: string, parentPath: string, isDir = false) {
  return testDB.db.nzbFile.create({ data: { path, name, parentPath, isDir } });
}

describe("POST /api/nzb/delete", () => {
  test("returns 400 when paths is missing", async () => {
    const { POST } = await loadRoute("no-paths");
    const res = await POST(jsonRequest("/api/nzb/delete", {}));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string; details: unknown };
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  test("returns 400 when paths is empty", async () => {
    const { POST } = await loadRoute("empty-paths");
    const res = await POST(jsonRequest("/api/nzb/delete", { paths: [] }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 when any path is an empty string", async () => {
    const { POST } = await loadRoute("empty-string");
    const res = await POST(jsonRequest("/api/nzb/delete", { paths: ["/ok", ""] }));
    expect(status(res)).toBe(400);
  });

  test("deletes a single file (no children) and returns its count", async () => {
    await seedFile("/nzbs/one.nzb", "one.nzb", "/nzbs", false);

    const { POST } = await loadRoute("single");
    const res = await POST(jsonRequest("/api/nzb/delete", { paths: ["/nzbs/one.nzb"] }));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 1 });

    const remaining = await testDB.db.nzbFile.findMany();
    expect(remaining).toHaveLength(0);
  });

  test("expands a parent dir to include its direct children", async () => {
    await seedFile("/dir", "dir", "", true);
    await seedFile("/dir/alpha.nzb", "alpha.nzb", "/dir", false);
    await seedFile("/dir/sub", "sub", "/dir", true);
    await seedFile("/dir/sub/beta.nzb", "beta.nzb", "/dir/sub", false);
    await seedFile("/elsewhere/x.nzb", "x.nzb", "/elsewhere", false);

    const { POST } = await loadRoute("expand");
    const res = await POST(jsonRequest("/api/nzb/delete", { paths: ["/dir"] }));
    expect(status(res)).toBe(200);
    // /dir + its direct children (/dir/alpha.nzb, /dir/sub). Note: the
    // route does single-level expansion only — /dir/sub/beta.nzb is NOT
    // included because /dir/sub wasn't in the selected paths set.
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 3 });

    const remaining = await testDB.db.nzbFile.findMany();
    const paths = remaining.map((r) => r.path).sort();
    expect(paths).toEqual(["/dir/sub/beta.nzb", "/elsewhere/x.nzb"]);
  });

  test("handles multiple parent paths in one call", async () => {
    await seedFile("/a", "a", "", true);
    await seedFile("/a/1.nzb", "1.nzb", "/a", false);
    await seedFile("/b", "b", "", true);
    await seedFile("/b/2.nzb", "2.nzb", "/b", false);

    const { POST } = await loadRoute("multi");
    const res = await POST(jsonRequest("/api/nzb/delete", { paths: ["/a", "/b"] }));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 4 });
  });

  test("returns 500 when getNzbChildren throws", async () => {
    mock.module("@/lib/db/queries", () => ({
      getNzbChildren: async () => {
        throw new Error("DB down");
      },
    }));
    const { POST } = await loadRoute("err");
    const res = await POST(jsonRequest("/api/nzb/delete", { paths: ["/x"] }));
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to delete NZB files" });
  });
});
