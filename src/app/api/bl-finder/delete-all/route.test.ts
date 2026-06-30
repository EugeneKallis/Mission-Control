/**
 * Unit tests for POST /api/bl-finder/delete-all
 *
 * Tests the safety checks (same as individual delete) and bulk iteration
 * logic. Symlink-on-disk tests use real temp files.
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { lstat, mkdtemp, rm, symlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { NextRequest } from "next/server";
import { jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;
let tmpDir: string;
let mockProbeResult: {
  ok: boolean;
  packets: number;
  error?: string;
  elapsedMs: number;
};

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
  mock.module("@/lib/broken-link", () => ({
    probeFileReadable: async () => mockProbeResult,
  }));
});

beforeEach(async () => {
  await testDB.db.fileCheck.deleteMany();
  tmpDir = await mkdtemp(join(tmpdir(), "blf-delete-all-"));
  mockProbeResult = {
    ok: false,
    packets: 0,
    error: "no packets (mock)",
    elapsedMs: 5,
  };
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

/** Create a real broken symlink (link -> target, then remove target). */
async function createBrokenSymlink(name: string): Promise<string> {
  const target = join(tmpDir, `${name}.target`);
  const link = join(tmpDir, name);
  await writeFile(target, "");
  await symlink(target, link);
  await rm(target, { force: true });
  // Sanity
  const st = await lstat(link);
  expect(st.isSymbolicLink()).toBe(true);
  return link;
}

/** Create a healthy symlink (link -> target, target exists). */
async function createHealthySymlink(name: string): Promise<string> {
  const target = join(tmpDir, `${name}.target`);
  const link = join(tmpDir, name);
  await writeFile(target, "");
  await symlink(target, link);
  return link;
}

async function seed(opts: {
  filePath: string;
  status?: string;
  mediaDir?: string;
  isIgnored?: boolean;
}) {
  return testDB.db.fileCheck.create({
    data: {
      filePath: opts.filePath,
      status: opts.status ?? "broken",
      mediaDir: opts.mediaDir ?? "special",
      isIgnored: opts.isIgnored ?? false,
    },
  });
}

function callDeleteAll(body: Record<string, unknown> = {}) {
  return loadRoute().then(({ POST }) =>
    POST(
      new NextRequest("http://localhost/api/bl-finder/delete-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
}

describe("POST /api/bl-finder/delete-all", () => {
  test("returns 0 deleted when no broken rows exist", async () => {
    const res = await callDeleteAll();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      deleted: number;
      total: number;
      results: unknown[];
    };
    expect(body.deleted).toBe(0);
    expect(body.total).toBe(0);
    expect(body.results).toEqual([]);
  });

  test("deletes a single broken symlink", async () => {
    const link = await createBrokenSymlink("file1.mkv");
    await seed({ filePath: link });

    const res = await callDeleteAll();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      deleted: number;
      total: number;
      results: { id: number; deleted: boolean }[];
    };
    expect(body.deleted).toBe(1);
    expect(body.total).toBe(1);
    expect(body.results[0].deleted).toBe(true);

    // Symlink gone
    let gone = false;
    try {
      await lstat(link);
    } catch {
      gone = true;
    }
    expect(gone).toBe(true);

    // Row gone
    const remaining = await testDB.db.fileCheck.findMany();
    expect(remaining.length).toBe(0);
  });

  test("deletes multiple broken symlinks", async () => {
    const link1 = await createBrokenSymlink("f1.mkv");
    const link2 = await createBrokenSymlink("f2.mkv");
    const link3 = await createBrokenSymlink("f3.mkv");
    await seed({ filePath: link1 });
    await seed({ filePath: link2 });
    await seed({ filePath: link3 });

    const res = await callDeleteAll();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      deleted: number;
      total: number;
      results: { deleted: boolean }[];
    };
    expect(body.deleted).toBe(3);
    expect(body.total).toBe(3);
    expect(body.results.every((r) => r.deleted)).toBe(true);
  });

  test("skips non-broken rows", async () => {
    const brokenLink = await createBrokenSymlink("broken.mkv");
    const okLink = await createHealthySymlink("ok.mkv");
    await seed({ filePath: brokenLink });
    await seed({ filePath: okLink, status: "ok" });

    const res = await callDeleteAll();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      deleted: number;
      total: number;
      results: { filePath: string; deleted: boolean }[];
    };
    // Only the broken row should be processed.
    expect(body.deleted).toBe(1);
    expect(body.total).toBe(1);
    expect(body.results[0].filePath).toBe(brokenLink);
    expect(body.results[0].deleted).toBe(true);

    // The ok row is untouched.
    const remaining = await testDB.db.fileCheck.findMany({
      where: { status: "ok" },
    });
    expect(remaining.length).toBe(1);
    // And its symlink is still there.
    expect((await lstat(okLink)).isSymbolicLink()).toBe(true);
  });

  test("skips ignored broken rows", async () => {
    const ignoredLink = await createBrokenSymlink("ignored.mkv");
    const activeLink = await createBrokenSymlink("active.mkv");
    await seed({ filePath: ignoredLink, isIgnored: true });
    await seed({ filePath: activeLink });

    const res = await callDeleteAll();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      deleted: number;
      total: number;
    };
    expect(body.deleted).toBe(1);
    expect(body.total).toBe(1);

    // Ignored row remains.
    const rows = await testDB.db.fileCheck.findMany({ orderBy: { id: "asc" } });
    expect(rows.length).toBe(1);
    expect(rows[0].filePath).toBe(ignoredLink);
    expect(rows[0].isIgnored).toBe(true);
  });

  test("refuses to delete a playable symlink", async () => {
    mockProbeResult = { ok: true, packets: 5, elapsedMs: 10 };

    const recoveredLink = await createHealthySymlink("recovered.mkv");
    // We manually mark it broken in the DB to simulate a row that never
    // got re-checked after the target came back.
    await seed({ filePath: recoveredLink });

    const res = await callDeleteAll();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      deleted: number;
      total: number;
      results: { deleted: boolean; error?: string }[];
    };
    expect(body.deleted).toBe(0);
    expect(body.total).toBe(1);
    expect(body.results[0].deleted).toBe(false);
    expect(body.results[0].error).toMatch(/playable|packets/);

    // Symlink still there.
    expect((await lstat(recoveredLink)).isSymbolicLink()).toBe(true);
  });

  test("respects mediaDir filter", async () => {
    const link1 = await createBrokenSymlink("movies.mkv");
    const link2 = await createBrokenSymlink("tv.mkv");
    await seed({ filePath: link1, mediaDir: "movies" });
    await seed({ filePath: link2, mediaDir: "tv" });

    const res = await callDeleteAll({ mediaDir: "movies" });
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      deleted: number;
      total: number;
    };
    expect(body.deleted).toBe(1);
    expect(body.total).toBe(1);

    // The tv row is untouched.
    const remaining = await testDB.db.fileCheck.findMany();
    expect(remaining.length).toBe(1);
    expect(remaining[0].mediaDir).toBe("tv");
  });

  test("handles a mix of deletable and non-deletable rows gracefully", async () => {
    const good = await createBrokenSymlink("good.mkv");
    const recovered = await createHealthySymlink("recovered.mkv");
    const notSymlink = join(tmpDir, "regular.txt");
    await writeFile(notSymlink, "");
    const alsoGood = await createBrokenSymlink("also-good.mkv");

    await seed({ filePath: good });
    await seed({ filePath: recovered });
    await seed({ filePath: notSymlink });
    await seed({ filePath: alsoGood });

    // Mock returns unplayable for all rows. The only non-deletable
    // row is notSymlink (regular file, caught by lstat).
    const res = await callDeleteAll();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      deleted: number;
      total: number;
      results: { deleted: boolean; error?: string }[];
    };
    // 3 symlinks deleted (all unplayable), 1 regular file refused.
    expect(body.deleted).toBe(3);
    expect(body.total).toBe(4);
    expect(body.results.filter((r) => !r.deleted).length).toBe(1);
    expect(body.results.find((r) => !r.deleted)?.error).toMatch(/not a symlink/i);
  });
});
