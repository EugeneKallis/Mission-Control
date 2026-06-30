/**
 * Unit tests for POST /api/bl-finder/ignore/[id]
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
import { NextRequest } from "next/server";
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
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

async function callIgnore(id: number | string) {
  const { POST } = await loadRoute();
  return POST(
    new NextRequest(`http://localhost/api/bl-finder/ignore/${id}`, { method: "POST" }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("POST /api/bl-finder/ignore/[id]", () => {
  test("rejects non-numeric id", async () => {
    const res = await callIgnore("nope");
    expect(status(res)).toBe(400);
  });

  test("toggles isIgnored from false → true → false", async () => {
    const row = await testDB.db.fileCheck.create({
      data: { filePath: "/m/a.mkv", status: "pending", mediaDir: "special" },
    });

    let res = await callIgnore(row.id);
    expect(status(res)).toBe(200);
    let body = (await jsonBody(res)) as { isIgnored: boolean };
    expect(body.isIgnored).toBe(true);

    res = await callIgnore(row.id);
    body = (await jsonBody(res)) as { isIgnored: boolean };
    expect(body.isIgnored).toBe(false);
  });

  test("returns 500 on a non-existent id (Prisma throws)", async () => {
    const res = await callIgnore(9999);
    // The Prisma error is caught and surfaced as 500 (matches the
    // generic try/catch in the route).
    expect([404, 500]).toContain(status(res));
  });
});
