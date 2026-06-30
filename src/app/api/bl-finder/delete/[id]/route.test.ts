/**
 * Unit tests for POST /api/bl-finder/delete/[id]
 *
 * The delete route shells out to fs.rm on the symlink path and to
 * deleteFileCheckRow. We test the safety logic + the post-delete
 * DB state. Symlink-on-disk tests use a real temp file.
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

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

beforeEach(async () => {
  await testDB.db.fileCheck.deleteMany();
  tmpDir = await mkdtemp(join(tmpdir(), "blf-delete-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

async function seed(p: { filePath: string; status?: string }) {
  return testDB.db.fileCheck.create({
    data: {
      filePath: p.filePath,
      status: p.status ?? "broken",
      mediaDir: "special",
    },
  });
}

function callDelete(id: number | string) {
  return loadRoute().then(({ POST }) =>
    POST(
      new NextRequest(`http://localhost/api/bl-finder/delete/${id}`, { method: "POST" }),
      { params: Promise.resolve({ id: String(id) }) },
    ),
  );
}

describe("POST /api/bl-finder/delete/[id]", () => {
  test("rejects non-numeric id", async () => {
    const res = await callDelete("abc");
    expect(status(res)).toBe(400);
  });

  test("returns 404 for non-existent row", async () => {
    const res = await callDelete(9999);
    expect(status(res)).toBe(404);
  });

  test("refuses to delete a row whose status is not 'broken'", async () => {
    const row = await seed({ filePath: "/nonexistent/path.mkv", status: "ok" });
    const res = await callDelete(row.id);
    expect(status(res)).toBe(409);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toMatch(/not 'broken'/);
  });

  test("deletes a real broken symlink and removes the row", async () => {
    const target = join(tmpDir, "target.mkv");
    await writeFile(target, "");
    const link = join(tmpDir, "link.mkv");
    // Symlink whose target is then removed = broken symlink.
    await symlink(target, link);
    await rm(target, { force: true });

    // Sanity: confirm it's a broken symlink.
    const st = await lstat(link);
    expect(st.isSymbolicLink()).toBe(true);

    const row = await seed({ filePath: link });
    const res = await callDelete(row.id);
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { deleted: boolean; filePath: string };
    expect(body.deleted).toBe(true);

    // The symlink is gone.
    let gone = false;
    try { await lstat(link); } catch { gone = true; }
    expect(gone).toBe(true);

    // The row is gone too.
    const remaining = await testDB.db.fileCheck.findUnique({ where: { id: row.id } });
    expect(remaining).toBeNull();
  });

  test("refuses to delete if the symlink target is now reachable (recovered)", async () => {
    const target = join(tmpDir, "target.mkv");
    await writeFile(target, "");
    const link = join(tmpDir, "link.mkv");
    await symlink(target, link);

    const row = await seed({ filePath: link });
    const res = await callDelete(row.id);
    expect(status(res)).toBe(409);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toMatch(/recovered/);

    // Symlink and row still present.
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    const stillThere = await testDB.db.fileCheck.findUniqueOrThrow({ where: { id: row.id } });
    expect(stillThere.id).toBe(row.id);
  });

  test("refuses to delete a real file (not a symlink)", async () => {
    const f = join(tmpDir, "file.mkv");
    await writeFile(f, "");
    const row = await seed({ filePath: f });
    const res = await callDelete(row.id);
    expect(status(res)).toBe(409);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toMatch(/not a symlink/);
  });
});
