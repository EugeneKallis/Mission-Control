/**
 * Unit tests for /api/nzb/delete (POST)
 *
 * Symmetric to /api/debrid/delete. The route requires indexed paths, resolves
 * them beneath MEDIA_BASE_PATH without following escaping parent symlinks,
 * expands directory children, deletes from disk, then deletes the index rows.
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
  mediaRoot = await mkdtemp(join(tmpdir(), "mc-nzb-delete-"));
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
  await testDB.db.nzbFile.deleteMany();
  await rm(mediaRoot, { recursive: true, force: true });
  await mkdir(mediaRoot, { recursive: true });
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

  test("deletes a valid indexed symlink without deleting its target", async () => {
    const target = join(mediaRoot, "target.nzb");
    const link = join(mediaRoot, "nzbs", "one.nzb");
    await mkdir(join(mediaRoot, "nzbs"));
    await writeFile(target, "keep");
    await symlink(target, link);
    await seedFile("nzbs/one.nzb", "one.nzb", "nzbs", false);

    const { POST } = await loadRoute("single");
    const res = await POST(jsonRequest("/api/nzb/delete", { paths: ["nzbs/one.nzb"] }));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 1 });
    expect(await lstat(link).then(() => true, () => false)).toBe(false);
    expect(await readFile(target, "utf8")).toBe("keep");
    expect(await testDB.db.nzbFile.count()).toBe(0);
  });

  test("rejects an indexed path outside the configured media root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "mc-nzb-outside-"));
    const victim = join(outside, "victim.nzb");
    await writeFile(victim, "keep");
    await seedFile(victim, "victim.nzb", "", false);

    try {
      const { POST } = await loadRoute("outside-root");
      const res = await POST(jsonRequest("/api/nzb/delete", { paths: [victim] }));
      expect(status(res)).toBe(403);
      expect(await readFile(victim, "utf8")).toBe("keep");
      expect(await testDB.db.nzbFile.count()).toBe(1);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("rejects a non-indexed path without touching disk", async () => {
    const victim = join(mediaRoot, "unindexed.nzb");
    await writeFile(victim, "keep");

    const { POST } = await loadRoute("non-indexed");
    const res = await POST(jsonRequest("/api/nzb/delete", { paths: ["unindexed.nzb"] }));
    expect(status(res)).toBe(400);
    expect(await readFile(victim, "utf8")).toBe("keep");
  });

  test("rejects an indexed path reached through an escaping parent symlink", async () => {
    const outside = await mkdtemp(join(tmpdir(), "mc-nzb-symlink-"));
    const victim = join(outside, "victim.nzb");
    await writeFile(victim, "keep");
    await symlink(outside, join(mediaRoot, "escape"));
    await seedFile("escape/victim.nzb", "victim.nzb", "escape", false);

    try {
      const { POST } = await loadRoute("symlink-escape");
      const res = await POST(jsonRequest("/api/nzb/delete", { paths: ["escape/victim.nzb"] }));
      expect(status(res)).toBe(403);
      expect(await readFile(victim, "utf8")).toBe("keep");
      expect(await testDB.db.nzbFile.count()).toBe(1);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("expands a parent dir to include its direct children", async () => {
    await seedFile("dir", "dir", "", true);
    await seedFile("dir/alpha.nzb", "alpha.nzb", "dir", false);
    await seedFile("dir/sub", "sub", "dir", true);
    await seedFile("dir/sub/beta.nzb", "beta.nzb", "dir/sub", false);
    await seedFile("elsewhere/x.nzb", "x.nzb", "elsewhere", false);

    const { POST } = await loadRoute("expand");
    const res = await POST(jsonRequest("/api/nzb/delete", { paths: ["dir"] }));
    expect(status(res)).toBe(200);
    // /dir + its direct children (/dir/alpha.nzb, /dir/sub). Note: the
    // route does single-level expansion only — /dir/sub/beta.nzb is NOT
    // included because /dir/sub wasn't in the selected paths set.
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 3 });

    const remaining = await testDB.db.nzbFile.findMany();
    const paths = remaining.map((r) => r.path).sort();
    expect(paths).toEqual(["dir/sub/beta.nzb", "elsewhere/x.nzb"]);
  });

  test("handles multiple parent paths in one call", async () => {
    await seedFile("a", "a", "", true);
    await seedFile("a/1.nzb", "1.nzb", "a", false);
    await seedFile("b", "b", "", true);
    await seedFile("b/2.nzb", "2.nzb", "b", false);

    const { POST } = await loadRoute("multi");
    const res = await POST(jsonRequest("/api/nzb/delete", { paths: ["a", "b"] }));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true, deleted: 4 });
  });

  test("returns 500 when getNzbChildren throws", async () => {
    await seedFile("x", "x", "", true);
    mock.module("@/lib/db/queries", () => ({
      getNzbChildren: async () => {
        throw new Error("DB down");
      },
    }));
    const { POST } = await loadRoute("err");
    const res = await POST(jsonRequest("/api/nzb/delete", { paths: ["x"] }));
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to delete NZB files" });
  });
});
