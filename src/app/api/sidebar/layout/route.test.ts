import { describe, test, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";
import { NextRequest } from "next/server";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { defaultSidebarLayout } from "@/lib/nav-registry";

let testDB: TestDB;
beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});
afterAll(() => testDB.cleanup());
beforeEach(async () => { await testDB.db.setting.deleteMany(); });

async function load() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}
function request(body: unknown) {
  return new NextRequest("http://localhost/api/sidebar/layout", { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

describe("sidebar layout API", () => {
  test("GET returns default when unset", async () => {
    const { GET } = await load();
    expect(await (await GET()).json()).toEqual(defaultSidebarLayout());
  });
  test("PUT persists a valid layout", async () => {
    const { PUT, GET } = await load();
    const layout = defaultSidebarLayout();
    layout.groups[0].name = "Operators";
    expect((await PUT(request(layout))).status).toBe(200);
    expect((await GET()).json()).resolves.toEqual(layout);
  });
  test("PUT rejects duplicate keys", async () => {
    const { PUT } = await load();
    const layout = defaultSidebarLayout();
    layout.groups[1].items.push("chat");
    const response = await PUT(request(layout));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/appears more than once/);
  });
});
