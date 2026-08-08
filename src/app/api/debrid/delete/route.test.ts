/**
 * Unit tests for /api/debrid/delete (POST)
 *
 * The route requires indexed paths, resolves them beneath MEDIA_BASE_PATH
 * without following escaping parent symlinks, expands directory children,
 * deletes from disk, then deletes the index rows.
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
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;
let mediaRoot: string;
const originalMediaBasePath = process.env.MEDIA_BASE_PATH;

beforeAll(async () => {
  testDB = await makeTestDB();
  mediaRoot = await mkdtemp(join(tmpdir(), "mc-debrid-delete-"));
  process.env.MEDIA_BASE_PATH = mediaRoot;
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  if (originalMediaBasePath === undefined) delete process.env.MEDIA_BASE_PATH;
  else process.env.MEDIA_BASE_PATH = originalMediaBasePath;
  await rm(mediaRoot, { recursive: true, force: true });
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.debridFile.deleteMany();
  await rm(mediaRoot, { recursive: true, force: true });
  await mkdir(mediaRoot, { recursive: true });
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

  test("deletes a valid indexed symlink without deleting its target", async () => {
    const target = join(mediaRoot, "target.mkv");
    const link = join(mediaRoot, "movies", "one.mkv");
    await mkdir(join(mediaRoot, "movies"));
    await writeFile(target, "keep");
    await symlink(target, link);
    await seedFile("movies/one.mkv", "one.mkv", "movies", false);

    const { POST } = await loadRoute("single");
    const res = await POST(jsonRequest("/api/debrid/delete", { paths: ["movies/one.mkv"] }));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 1 });
    expect(await lstat(link).then(() => true, () => false)).toBe(false);
    expect(await readFile(target, "utf8")).toBe("keep");
    expect(await testDB.db.debridFile.count()).toBe(0);
  });

  test("rejects an indexed path outside the configured media root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "mc-debrid-outside-"));
    const victim = join(outside, "victim.mkv");
    await writeFile(victim, "keep");
    await seedFile(victim, "victim.mkv", "", false);

    try {
      const { POST } = await loadRoute("outside-root");
      const res = await POST(jsonRequest("/api/debrid/delete", { paths: [victim] }));
      expect(status(res)).toBe(403);
      expect(await readFile(victim, "utf8")).toBe("keep");
      expect(await testDB.db.debridFile.count()).toBe(1);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("rejects a non-indexed path without touching disk", async () => {
    const victim = join(mediaRoot, "unindexed.mkv");
    await writeFile(victim, "keep");

    const { POST } = await loadRoute("non-indexed");
    const res = await POST(jsonRequest("/api/debrid/delete", { paths: ["unindexed.mkv"] }));
    expect(status(res)).toBe(400);
    expect(await readFile(victim, "utf8")).toBe("keep");
  });

  test("rejects an indexed path reached through an escaping parent symlink", async () => {
    const outside = await mkdtemp(join(tmpdir(), "mc-debrid-symlink-"));
    const victim = join(outside, "victim.mkv");
    await writeFile(victim, "keep");
    await symlink(outside, join(mediaRoot, "escape"));
    await seedFile("escape/victim.mkv", "victim.mkv", "escape", false);

    try {
      const { POST } = await loadRoute("symlink-escape");
      const res = await POST(jsonRequest("/api/debrid/delete", { paths: ["escape/victim.mkv"] }));
      expect(status(res)).toBe(403);
      expect(await readFile(victim, "utf8")).toBe("keep");
      expect(await testDB.db.debridFile.count()).toBe(1);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("expands a parent dir to include its direct children", async () => {
    await seedFile("dir", "dir", "", true);
    await seedFile("dir/a.txt", "a.txt", "dir", false);
    await seedFile("dir/sub", "sub", "dir", true);
    await seedFile("dir/sub/b.txt", "b.txt", "dir/sub", false);
    await seedFile("elsewhere/x.txt", "x.txt", "elsewhere", false);

    const { POST } = await loadRoute("expand");
    const res = await POST(jsonRequest("/api/debrid/delete", { paths: ["dir"] }));
    expect(status(res)).toBe(200);
    // /dir + its direct children (/dir/a.txt, /dir/sub). Note: the route
    // does single-level expansion only — /dir/sub/b.txt is NOT included
    // because /dir/sub wasn't in the selected paths set.
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 3 });

    const remaining = await testDB.db.debridFile.findMany();
    const paths = remaining.map((r) => r.path).sort();
    expect(paths).toEqual(["dir/sub/b.txt", "elsewhere/x.txt"]);
  });

  test("handles multiple parent paths in one call", async () => {
    await seedFile("d1", "d1", "", true);
    await seedFile("d1/a", "a", "d1", false);
    await seedFile("d2", "d2", "", true);
    await seedFile("d2/b", "b", "d2", false);

    const { POST } = await loadRoute("multi");
    const res = await POST(
      jsonRequest("/api/debrid/delete", { paths: ["d1", "d2"] }),
    );
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 4 });
  });

  test("returns 500 when getDebridChildren throws", async () => {
    await seedFile("x", "x", "", true);
    mock.module("@/lib/db/queries", () => ({
      getDebridChildren: async () => {
        throw new Error("DB down");
      },
    }));
    const { POST } = await loadRoute("err");
    const res = await POST(jsonRequest("/api/debrid/delete", { paths: ["x"] }));
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to delete debrid files" });
  });
});
