/**
 * Unit + integration tests for src/lib/db/queries.ts
 *
 * Strategy: spin up a real in-file Prisma client pointed at a fresh
 * temp-file SQLite DB, then `mock.module("@/lib/db", ...)` so that the
 * queries file talks to *that* DB instead of the dev one. This gives us
 * real SQL round-trips (including the unique-key conflict handling in
 * createScrapeResult, the date math in cleanOldScrapeResults, and the
 * auto-Ungrouped creation in getGroupedMacros) without polluting the
 * dev database.
 *
 * Because `mock.module` must run before any module that imports
 * `@/lib/db` is loaded, we use the `?fresh` query-string trick to
 * re-import queries.ts inside the test (Bun treats `?fresh` as a
 * cache-buster).
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { makeTestDB, type TestDB } from "./test-helpers";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

// Re-import queries inside each test so mock.module takes effect. We
// use a unique cache-buster per test to avoid carrying the same module
// instance across tests.
async function loadQueries(suffix: string) {
  return import(`./queries?bust=${Date.now()}-${suffix}`) as Promise<typeof import("./queries")>;
}

beforeEach(async () => {
  // Wipe relevant tables between tests. Order matters because of FKs:
  //   scraped_item_files -> scraped_items (cascade)
  //   history -> macros (restrict) — delete histories first
  //   schedules -> macros (restrict) — delete schedules first
  //   scrape_results (no FKs out of it)
  await testDB.db.history.deleteMany();
  await testDB.db.schedule.deleteMany();
  await testDB.db.scrapeResult.deleteMany();
  await testDB.db.macro.deleteMany();
  await testDB.db.macroGroup.deleteMany();
  await testDB.db.setting.deleteMany();
  await testDB.db.config.deleteMany();
  await testDB.db.serverAgent.deleteMany();
  await testDB.db.nzbFile.deleteMany();
  await testDB.db.debridFile.deleteMany();
});

// ── macros + groups ────────────────────────────────────────────────────

describe("getGroupedMacros", () => {
  test("auto-creates an 'Ungrouped' group when none exists", async () => {
    const q = await loadQueries("grouped1");
    const groups = await q.getGroupedMacros();
    // The Ungrouped group is always present and listed last.
    const ungrouped = groups.find((g) => g.group.name === "Ungrouped");
    expect(ungrouped).toBeDefined();
  });

  test("does NOT duplicate Ungrouped when one already exists", async () => {
    await testDB.db.macroGroup.create({ data: { name: "Ungrouped", ord: 0 } });
    const q = await loadQueries("grouped2");
    const groups = await q.getGroupedMacros();
    const ungrouped = groups.filter((g) => g.group.name === "Ungrouped");
    expect(ungrouped).toHaveLength(1);
  });

  test("groups macros by their groupName, preserving group ord", async () => {
    const alpha = await testDB.db.macroGroup.create({ data: { name: "Alpha", ord: 1 } });
    const beta = await testDB.db.macroGroup.create({ data: { name: "Beta", ord: 2 } });
    await testDB.db.macro.create({ data: { name: "b-macro", groupName: "Beta", ord: 0 } });
    await testDB.db.macro.create({ data: { name: "a1", groupName: "Alpha", ord: 0 } });
    await testDB.db.macro.create({ data: { name: "a2", groupName: "Alpha", ord: 1 } });

    const q = await loadQueries("grouped3");
    const groups = await q.getGroupedMacros();
    // The first two are the user-defined groups in ord order
    expect(groups[0].group.id).toBe(alpha.id);
    expect(groups[1].group.id).toBe(beta.id);
    expect(groups[0].macros.map((m) => m.name)).toEqual(["a1", "a2"]);
    expect(groups[1].macros.map((m) => m.name)).toEqual(["b-macro"]);
  });
});

// ── scrape_results ─────────────────────────────────────────────────────

describe("createScrapeResult", () => {
  test("inserts a new result and returns it", async () => {
    const q = await loadQueries("sr1");
    const r = await q.createScrapeResult({
      source: "141jav",
      title: "Sample",
      uniqueKey: "magnet:?xt=urn:btih:AAAA",
    });
    expect(r.id).toBeGreaterThan(0);
    expect(r.isHidden).toBe(false);
    expect(r.isDownloaded).toBe(false);
  });

  test("is idempotent on uniqueKey (no duplicate insert)", async () => {
    const q = await loadQueries("sr2");
    const first = await q.createScrapeResult({
      source: "141jav",
      title: "First",
      uniqueKey: "magnet:?xt=urn:btih:BBBB",
    });
    const second = await q.createScrapeResult({
      source: "141jav",
      title: "Second (would-be duplicate)",
      uniqueKey: "magnet:?xt=urn:btih:BBBB",
    });
    expect(second.id).toBe(first.id);
    // The first row's title wins; the duplicate insert is skipped.
    const all = await testDB.db.scrapeResult.findMany();
    expect(all).toHaveLength(1);
  });
});

describe("hide / undo hide / mark downloaded", () => {
  test("hide sets isHidden + hiddenAt; undo clears them", async () => {
    const q = await loadQueries("hide1");
    const r = await q.createScrapeResult({
      source: "pornrips",
      title: "X",
      uniqueKey: "K1",
    });
    await q.hideScrapeResult(r.id);
    const hidden = await testDB.db.scrapeResult.findUnique({ where: { id: r.id } });
    expect(hidden?.isHidden).toBe(true);
    expect(hidden?.hiddenAt).toBeInstanceOf(Date);

    await q.undoHideScrapeResult(r.id);
    const unhidden = await testDB.db.scrapeResult.findUnique({ where: { id: r.id } });
    expect(unhidden?.isHidden).toBe(false);
    expect(unhidden?.hiddenAt).toBeNull();
  });

  test("markScrapeResultDownloaded sets isDownloaded + isHidden", async () => {
    const q = await loadQueries("dl1");
    const r = await q.createScrapeResult({
      source: "pornrips",
      title: "X",
      uniqueKey: "K2",
    });
    await q.markScrapeResultDownloaded(r.id);
    const after = await testDB.db.scrapeResult.findUnique({ where: { id: r.id } });
    expect(after?.isDownloaded).toBe(true);
    expect(after?.isHidden).toBe(true);
  });
});

describe("cleanOldScrapeResults", () => {
  test("deletes hidden results older than 20 days, leaves newer ones", async () => {
    const q = await loadQueries("clean1");
    const old = await q.createScrapeResult({
      source: "s",
      title: "Old",
      uniqueKey: "OLD",
    });
    const recent = await q.createScrapeResult({
      source: "s",
      title: "Recent",
      uniqueKey: "NEW",
    });
    // Manually push the old one back 21 days
    await testDB.db.scrapeResult.update({
      where: { id: old.id },
      data: {
        isHidden: true,
        hiddenAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
      },
    });
    // And hide the recent one too — same isHidden, but recent
    await testDB.db.scrapeResult.update({
      where: { id: recent.id },
      data: { isHidden: true, hiddenAt: new Date() },
    });

    const result = await q.cleanOldScrapeResults();
    expect(result.count).toBe(1);
    const remaining = await testDB.db.scrapeResult.findMany();
    expect(remaining.map((r) => r.uniqueKey)).toEqual(["NEW"]);
  });

  test("does NOT touch non-hidden results even when old", async () => {
    const q = await loadQueries("clean2");
    const r = await q.createScrapeResult({
      source: "s",
      title: "Visible but old",
      uniqueKey: "VISIBLE",
    });
    await testDB.db.scrapeResult.update({
      where: { id: r.id },
      data: { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    const result = await q.cleanOldScrapeResults();
    expect(result.count).toBe(0);
    const remaining = await testDB.db.scrapeResult.findMany();
    expect(remaining).toHaveLength(1);
  });
});

describe("deleteScrapeResultsBySource", () => {
  test("only deletes non-downloaded rows for the given source", async () => {
    const q = await loadQueries("del1");
    const a = await q.createScrapeResult({ source: "a", title: "A", uniqueKey: "A1" });
    const b = await q.createScrapeResult({ source: "b", title: "B", uniqueKey: "B1" });
    const aDownloaded = await q.createScrapeResult({ source: "a", title: "A2", uniqueKey: "A2" });
    await q.markScrapeResultDownloaded(aDownloaded.id);

    const result = await q.deleteScrapeResultsBySource("a");
    expect(result.count).toBe(1);
    const remaining = await testDB.db.scrapeResult.findMany();
    // a is deleted (source=a, not downloaded), b and aDownloaded remain
    expect(remaining.map((r) => r.id).sort()).toEqual([b.id, aDownloaded.id].sort());
  });
});

// ── settings ───────────────────────────────────────────────────────────

describe("getSetting / updateSetting", () => {
  test("returns null for a key that was never set", async () => {
    const q = await loadQueries("set1");
    expect(await q.getSetting("nope")).toBeNull();
  });

  test("updateSetting creates the row, then updates it on a second call", async () => {
    const q = await loadQueries("set2");
    await q.updateSetting("foo", "1");
    expect(await q.getSetting("foo")).toBe("1");
    await q.updateSetting("foo", "2");
    expect(await q.getSetting("foo")).toBe("2");
  });
});

// ── config (DB-backed) ─────────────────────────────────────────────────

describe("getConfig / upsertConfig", () => {
  test("getConfig creates a default row on first read", async () => {
    const q = await loadQueries("cfg1");
    const cfg = await q.getConfig();
    expect(cfg.id).toBe(1);
    expect(JSON.parse(cfg.configJson)).toEqual({ real_debrid_api_key: "" });
  });

  test("upsertConfig updates the singleton row", async () => {
    const q = await loadQueries("cfg2");
    await q.upsertConfig('{"real_debrid_api_key":"NEW-KEY"}');
    const cfg = await q.getConfig();
    expect(JSON.parse(cfg.configJson).real_debrid_api_key).toBe("NEW-KEY");
  });
});

// ── schedules ──────────────────────────────────────────────────────────

describe("toggleSchedule", () => {
  test("flips enabled on each call", async () => {
    const q = await loadQueries("sched1");
    const macro = await testDB.db.macro.create({ data: { name: "m" } });
    const s = await testDB.db.schedule.create({
      data: { macroId: macro.id, cronExpression: "* * * * *" },
    });
    expect(s.enabled).toBe(true);

    const flipped1 = await q.toggleSchedule(s.id);
    expect(flipped1.enabled).toBe(false);
    const flipped2 = await q.toggleSchedule(s.id);
    expect(flipped2.enabled).toBe(true);
  });
});

// ── server agents ──────────────────────────────────────────────────────

describe("upsertServerAgent", () => {
  test("creates on first call, updates on second", async () => {
    const q = await loadQueries("agent1");
    const a = await q.upsertServerAgent({ hostname: "h1", cpuUsage: 10 });
    expect(a.hostname).toBe("h1");
    expect(a.cpuUsage).toBe(10);
    const lastSeen1 = a.lastSeen;

    // Sleep 10ms so lastSeen changes
    await new Promise((r) => setTimeout(r, 10));
    const b = await q.upsertServerAgent({ hostname: "h1", cpuUsage: 99 });
    expect(b.id).toBe(a.id);
    expect(b.cpuUsage).toBe(99);
    expect(b.lastSeen.getTime()).toBeGreaterThanOrEqual(lastSeen1.getTime());
  });
});

// ── nzb_files / debrid_files ──────────────────────────────────────────

describe("upsertNzbFile + queries", () => {
  test("upsertNzbFile creates, then updates, preserving path", async () => {
    const q = await loadQueries("nzb1");
    const f = await q.upsertNzbFile({
      path: "movies/A",
      name: "A",
      isDir: true,
      parentPath: "movies",
    });
    expect(f.path).toBe("movies/A");
    expect(f.fileCount).toBe(0);

    const updated = await q.upsertNzbFile({
      path: "movies/A",
      name: "A",
      isDir: true,
      parentPath: "movies",
      fileCount: 5,
    });
    expect(updated.id).toBe(f.id);
    expect(updated.fileCount).toBe(5);

    // getNzbChildren returns the children of "movies"
    const children = await q.getNzbChildren("movies");
    expect(children.map((c) => c.path)).toEqual(["movies/A"]);
  });

  test("getNzbRootFiles returns only entries with empty parentPath", async () => {
    const q = await loadQueries("nzb2");
    await q.upsertNzbFile({ path: "movies", name: "movies", isDir: true, parentPath: "" });
    await q.upsertNzbFile({ path: "tv", name: "tv", isDir: true, parentPath: "" });
    await q.upsertNzbFile({ path: "movies/A", name: "A", isDir: false, parentPath: "movies" });
    const roots = await q.getNzbRootFiles();
    expect(roots.map((r) => r.path).sort()).toEqual(["movies", "tv"]);
  });

  test("searchNzbFiles uses name LIKE", async () => {
    const q = await loadQueries("nzb3");
    await q.upsertNzbFile({ path: "movies/Heat", name: "Heat", isDir: false, parentPath: "movies" });
    await q.upsertNzbFile({ path: "movies/Alien", name: "Alien", isDir: false, parentPath: "movies" });
    await q.upsertNzbFile({ path: "movies/Matrix", name: "Matrix", isDir: false, parentPath: "movies" });
    const results = await q.searchNzbFiles("ali");
    expect(results.map((r) => r.name)).toEqual(["Alien"]);
    expect(await q.countSearchNzbFiles("ali")).toBe(1);
  });

  test("deleteNzbFilesOlderThan removes stale rows", async () => {
    const q = await loadQueries("nzb4");
    const old = await q.upsertNzbFile({
      path: "old",
      name: "old",
      isDir: false,
      parentPath: "",
      updatedAt: new Date(Date.now() - 60_000),
    });
    const fresh = await q.upsertNzbFile({
      path: "new",
      name: "new",
      isDir: false,
      parentPath: "",
    });
    const r = await q.deleteNzbFilesOlderThan(new Date(Date.now() - 1000));
    expect(r.count).toBe(1);
    const remaining = await testDB.db.nzbFile.findMany();
    expect(remaining.map((f) => f.path)).toEqual(["new"]);
  });
});

// ── database metadata ──────────────────────────────────────────────────

describe("listTableNames", () => {
  test("returns the user-defined tables, excluding Prisma internals", async () => {
    const q = await loadQueries("meta1");
    const tables = await q.listTableNames();
    expect(tables).toContain("macros");
    expect(tables).toContain("scrape_results");
    expect(tables).toContain("settings");
    expect(tables).not.toContain("_prisma_migrations");
  });
});

describe("queryTable", () => {
  test("applies column filters as LIKE clauses", async () => {
    const q = await loadQueries("meta2");
    await testDB.db.macro.create({ data: { name: "Heat", description: "1995 movie" } });
    await testDB.db.macro.create({ data: { name: "Alien", description: "1979 movie" } });
    await testDB.db.macro.create({ data: { name: "Matrix", description: "1999 sci-fi" } });

    const all = await q.queryTable("macros", {}, 100);
    expect(all.length).toBe(3);

    const byName = await q.queryTable("macros", { name: "ali" }, 100);
    expect(byName.length).toBe(1);
    expect(byName[0].name).toBe("Alien");

    const byDesc = await q.queryTable("macros", { description: "199" }, 100);
    expect(byDesc.length).toBe(2);
  });
});
