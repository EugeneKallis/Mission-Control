/**
 * Unit tests for POST /api/bl-finder/trigger-scan
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
import { jsonBody, status } from "@/test-utils/route-helpers";

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
  await testDB.db.setting.deleteMany();
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("POST /api/bl-finder/trigger-scan", () => {
  test("marks all non-ignored rows pending and reports the count", async () => {
    await testDB.db.fileCheck.create({
      data: { filePath: "/m/a.mkv", status: "ok", mediaDir: "special" },
    });
    await testDB.db.fileCheck.create({
      data: { filePath: "/m/b.mkv", status: "broken", mediaDir: "special" },
    });

    const { POST } = await loadRoute();
    const res = await POST(
      new (await import("next/server")).NextRequest(
        "http://localhost/api/bl-finder/trigger-scan",
        { method: "POST" },
      ),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { updated: number };
    expect(body.updated).toBe(2);
    const rows = await testDB.db.fileCheck.findMany();
    for (const r of rows) expect(r.status).toBe("pending");
  });

  test("clears lastPassAt in the status row", async () => {
    await testDB.db.setting.create({
      data: {
        key: "blfinder_status",
        value: JSON.stringify({
          running: false,
          setAt: Date.now(),
          lastPassAt: Date.now(),
          processed: 1,
          ok: 1,
          broken: 0,
          error: null,
        }),
      },
    });
    const { POST } = await loadRoute();
    await POST(
      new (await import("next/server")).NextRequest(
        "http://localhost/api/bl-finder/trigger-scan",
        { method: "POST" },
      ),
    );
    const row = await testDB.db.setting.findUniqueOrThrow({
      where: { key: "blfinder_status" },
    });
    const body = JSON.parse(row.value!);
    expect(body.lastPassAt).toBeNull();
  });
});
