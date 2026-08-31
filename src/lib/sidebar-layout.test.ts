import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { makeTestDB, type TestDB } from "./db/test-helpers";
import { defaultSidebarLayout } from "./nav-registry";

let testDB: TestDB;
beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});
beforeEach(async () => {
  await testDB.db.setting.deleteMany();
});

async function load() {
  return import(`./sidebar-layout?bust=${Date.now()}-${Math.random()}`);
}

describe("sidebar layout", () => {
  test("returns the default on an empty database", async () => {
    const { getSidebarLayout } = await load();
    expect(await getSidebarLayout()).toEqual(defaultSidebarLayout());
  });

  test("round-trips a modified layout", async () => {
    const { getSidebarLayout, saveSidebarLayout } = await load();
    const layout = defaultSidebarLayout();
    layout.groups[0].name = "Operators";
    layout.groups[0].items = ["pi-settings", "chat", "agent-tasks"];
    layout.hidden = ["scraper"];
    layout.groups.at(-1)!.items = [];
    await saveSidebarLayout(layout);
    expect(await getSidebarLayout()).toEqual(layout);
  });

  test("rejects duplicate, unknown, and missing keys", async () => {
    const { normalizeSidebarLayout } = await load();
    const layout = defaultSidebarLayout();
    layout.groups[1].items.push("chat");
    expect(() => normalizeSidebarLayout(layout)).toThrow();
    layout.groups[1].items.pop();
    layout.groups[1].items[0] = "unknown";
    expect(() => normalizeSidebarLayout(layout)).toThrow();
    layout.groups[1].items[0] = "history";
    layout.hidden = ["schedules"];
    expect(() => normalizeSidebarLayout(layout)).toThrow();
    layout.hidden = [];
    layout.groups[1].items = [];
    expect(() => normalizeSidebarLayout(layout)).toThrow();
  });
  test("appends ungrouped when absent", async () => {
    const { normalizeSidebarLayout } = await load();
    const layout = defaultSidebarLayout();
    layout.groups = layout.groups.filter((group) => group.id !== "ungrouped");
    layout.hidden = ["scraper"];
    expect(normalizeSidebarLayout(layout).groups.at(-1)?.id).toBe("ungrouped");
  });

  test("falls back from malformed stored JSON", async () => {
    const { getSidebarLayout } = await load();
    await testDB.db.setting.create({ data: { key: "sidebar:layout", value: "not-json" } });
    expect(await getSidebarLayout()).toEqual(defaultSidebarLayout());
  });
});
