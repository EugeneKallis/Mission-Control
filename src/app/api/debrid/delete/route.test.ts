/**
 * Unit tests for /api/debrid/delete (POST)
 *
 * The route:
 *   1. Validates { paths: string[].min(1) } with zod.
 *   2. Expands each parent via getDebridChildren(p, 100000) so dirs include
 *      their descendants in the delete set.
 *   3. Best-effort `rm(p, { force: true })` for each path (silent on missing).
 *   4. deleteDebridByPaths(allPaths) returns the row count.
 *
 * rm with force:true on non-existent paths is a silent no-op, so the test
 * can use fake paths without touching the filesystem.
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
  await testDB.db.debridFile.deleteMany();
});

async function loadRoute(suffix: string) {
  return import(`./route?bust=${Date.now()}-${suffix}`);
}

async function seedFile(path: string, name: string, parentPath: string, isDir = false) {
  return testDB.db.debridFile.create({ data: { path, name, parentPath, isDir } });
}

describe("POST /api/debrid/delete", () => {
  test("returns 400 when paths is missing", async () => {
    const { POST } = await loadRoute("no-paths");
    const res = await POST(jsonRequest("/api/debrid/delete", {}));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string; details: unknown };
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  test("returns 400 when paths is empty", async () => {
    const { POST } = await loadRoute("empty-paths");
    const res = await POST(jsonRequest("/api/debrid/delete", { paths: [] }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 when any path is an empty string", async () => {
    const { POST } = await loadRoute("empty-string");
    const res = await POST(jsonRequest("/api/debrid/delete", { paths: ["/ok", ""] }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("deletes a single file (no children) and returns its count", async () => {
    await seedFile("/lonely/file.txt", "file.txt", "/lonely", false);

    const { POST } = await loadRoute("single");
    const res = await POST(jsonRequest("/api/debrid/delete", { paths: ["/lonely/file.txt"] }));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 1 });

    const remaining = await testDB.db.debridFile.findMany();
    expect(remaining).toHaveLength(0);
  });

  test("expands a parent dir to include its direct children", async () => {
    await seedFile("/dir", "dir", "", true);
    await seedFile("/dir/a.txt", "a.txt", "/dir", false);
    await seedFile("/dir/sub", "sub", "/dir", true);
    await seedFile("/dir/sub/b.txt", "b.txt", "/dir/sub", false);
    await seedFile("/elsewhere/x.txt", "x.txt", "/elsewhere", false);

    const { POST } = await loadRoute("expand");
    const res = await POST(jsonRequest("/api/debrid/delete", { paths: ["/dir"] }));
    expect(status(res)).toBe(200);
    // /dir + its direct children (/dir/a.txt, /dir/sub). Note: the route
    // does single-level expansion only — /dir/sub/b.txt is NOT included
    // because /dir/sub wasn't in the selected paths set.
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 3 });

    const remaining = await testDB.db.debridFile.findMany();
    const paths = remaining.map((r) => r.path).sort();
    expect(paths).toEqual(["/dir/sub/b.txt", "/elsewhere/x.txt"]);
  });

  test("handles multiple parent paths in one call", async () => {
    await seedFile("/d1", "d1", "", true);
    await seedFile("/d1/a", "a", "/d1", false);
    await seedFile("/d2", "d2", "", true);
    await seedFile("/d2/b", "b", "/d2", false);

    const { POST } = await loadRoute("multi");
    const res = await POST(
      jsonRequest("/api/debrid/delete", { paths: ["/d1", "/d2"] }),
    );
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 4 });
  });

  test("returns 500 when getDebridChildren throws", async () => {
    mock.module("@/lib/db/queries", () => ({
      getDebridChildren: async () => {
        throw new Error("DB down");
      },
    }));
    const { POST } = await loadRoute("err");
    const res = await POST(jsonRequest("/api/debrid/delete", { paths: ["/x"] }));
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to delete debrid files" });
  });
});
