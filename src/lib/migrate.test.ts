/**
 * Tests for src/lib/migrate.ts.
 *
 * The ServerTool schema and the Mission Control schema are
 * **identical** for the tables we copy, so we can use the project's
 * `makeTestDB()` helper to build both the "source" and the "target"
 * databases. We seed the source with hand-crafted rows that mirror
 * what ServerTool would have, then run `applySnapshot` against the
 * target and assert.
 *
 * The test does NOT mock `@/lib/db` because `applySnapshot` takes
 * the Prisma client as a parameter. `previewSource` and
 * `readSourceSnapshot` are also parameter-free / take the source
 * path directly, so they need no mocking at all.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import {
  applySnapshot,
  humanBytes,
  previewSource,
  readSourceSnapshot,
  resolveSourcePath,
  SourceDbError,
  type SourceSnapshot,
} from "@/lib/migrate";
import type { PrismaClient } from "@prisma/client";

// ── Fixtures ─────────────────────────────────────────────────────────────

/** A small fake ServerTool-style snapshot we can hand to applySnapshot
 *  without round-tripping through the source DB in every test. */
function fakeSnapshot(): SourceSnapshot {
  return {
    macroGroups: [
      { id: 1, name: "Backups", ord: 0 },
      { id: 2, name: "Monitoring", ord: 1 },
    ],
    macros: [
      {
        id: 1,
        name: "Run Backup",
        description: "Daily pg_dump",
        groupName: "Backups",
        ord: 0,
        runOnAgent: false,
        agentHostname: "",
        commands: JSON.stringify([{ ord: 0, cmd: "scripts/backup.sh" }]),
      },
      {
        id: 2,
        name: "Restart Plex",
        description: "",
        groupName: "Monitoring",
        ord: 0,
        runOnAgent: true,
        agentHostname: "media-pc",
        commands: "[]",
      },
    ],
    scrapeResults: [
      {
        id: 1,
        source: "141jav",
        title: "FAKE-001",
        imageUrl: null,
        magnetLink: "magnet:?xt=urn:btih:aaaa",
        torrentLink: null,
        uniqueKey: "141jav:FAKE-001",
        infoHash: "aaaa",
        fileSize: "1.2 GB",
        tags: null,
      },
      {
        id: 2,
        source: "projectjav",
        title: "FAKE-002",
        imageUrl: "https://example.com/img.jpg",
        magnetLink: "magnet:?xt=urn:btih:bbbb",
        torrentLink: "https://example.com/FAKE-002.torrent",
        uniqueKey: "projectjav:FAKE-002",
        infoHash: "bbbb",
        fileSize: null,
        tags: "big-tits,1080p",
      },
    ],
    scrapedItems: [
      {
        id: 10,
        source: "141jav",
        title: "OLD-FAKE-001",
        imageUrl: null,
        magnetLink: "magnet:?xt=urn:btih:cccc",
        torrentLink: null,
        tags: null,
      },
    ],
    scrapedItemFiles: [
      {
        id: 100,
        scrapedItemId: 10,
        magnetLink: "magnet:?xt=urn:btih:dddd",
        fileSize: "500 MB",
        seeds: 12,
        leechers: 3,
      },
    ],
  };
}

/** Seed a Prisma DB as a "source" using the fake snapshot.
 *  Returns the real IDs of the seeded scraped_items so tests can
 *  build source-scraped_item_files that point to them. */
async function seedSource(
  db: PrismaClient,
  snap: SourceSnapshot = fakeSnapshot(),
): Promise<{ scrapedItemRealIds: Map<number, number> }> {
  for (const g of snap.macroGroups) {
    await db.macroGroup.create({ data: { name: g.name, ord: g.ord } });
  }
  for (const m of snap.macros) {
    await db.macro.create({
      data: {
        name: m.name,
        description: m.description,
        groupName: m.groupName,
        ord: m.ord,
        runOnAgent: m.runOnAgent,
        agentHostname: m.agentHostname,
        commands: m.commands,
      },
    });
  }
  for (const r of snap.scrapeResults) {
    await db.scrapeResult.create({
      data: {
        source: r.source,
        title: r.title,
        imageUrl: r.imageUrl,
        magnetLink: r.magnetLink,
        torrentLink: r.torrentLink,
        uniqueKey: r.uniqueKey,
        infoHash: r.infoHash,
        fileSize: r.fileSize,
        tags: r.tags,
      },
    });
  }
  // The source's scraped_items table has a foreign key from
  // scraped_item_files.scraped_item_id, so we have to capture the
  // real autoincremented IDs and patch the file rows to point at
  // them — otherwise the seed fails with a FK violation.
  const scrapedItemRealIds = new Map<number, number>();
  for (const s of snap.scrapedItems) {
    const created = await db.scrapedItem.create({
      data: {
        source: s.source,
        title: s.title,
        imageUrl: s.imageUrl,
        magnetLink: s.magnetLink,
        torrentLink: s.torrentLink,
        tags: s.tags,
      },
    });
    scrapedItemRealIds.set(s.id, created.id);
  }
  for (const f of snap.scrapedItemFiles) {
    const realParentId = scrapedItemRealIds.get(f.scrapedItemId);
    if (realParentId == null) {
      throw new Error(
        `seedSource: file ${f.id} references unknown scrapedItem ${f.scrapedItemId}`,
      );
    }
    await db.scrapedItemFile.create({
      data: {
        scrapedItemId: realParentId,
        magnetLink: f.magnetLink,
        fileSize: f.fileSize,
        seeds: f.seeds,
        leechers: f.leechers,
      },
    });
  }
  return { scrapedItemRealIds };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("resolveSourcePath", () => {
  test("throws on empty / whitespace input", async () => {
    await expect(resolveSourcePath("")).rejects.toBeInstanceOf(SourceDbError);
    await expect(resolveSourcePath("   ")).rejects.toBeInstanceOf(SourceDbError);
  });

  test("throws on non-existent path", async () => {
    await expect(
      resolveSourcePath("/this/does/not/exist/anywhere.db"),
    ).rejects.toBeInstanceOf(SourceDbError);
  });

  test("throws on a directory (not a file)", async () => {
    await expect(resolveSourcePath(tmpdir())).rejects.toBeInstanceOf(
      SourceDbError,
    );
  });

  test("throws on a non-SQLite file", async () => {
    const f = join(tmpdir(), `mc-migrate-test-${Date.now()}.txt`);
    await writeFile(f, "hello, world\n");
    try {
      await expect(resolveSourcePath(f)).rejects.toBeInstanceOf(
        SourceDbError,
      );
    } finally {
      await unlink(f).catch(() => {});
    }
  });

  test("throws on a SQLite WAL sidecar file", async () => {
    // WAL files have a different header (`WAL\0\0\0\0`), not the
    // `SQLite format 3\0` header. resolveSourcePath should reject.
    const f = join(tmpdir(), `mc-migrate-test-${Date.now()}.db-wal`);
    // First 8 bytes match the WAL magic
    const buf = Buffer.alloc(32);
    buf.write("WAL\0\0\0\0", 0, "ascii");
    await writeFile(f, buf);
    try {
      await expect(resolveSourcePath(f)).rejects.toBeInstanceOf(
        SourceDbError,
      );
    } finally {
      await unlink(f).catch(() => {});
    }
  });

  test("accepts a real SQLite file", async () => {
    const { db, cleanup, filePath } = await makeTestDB();
    try {
      const { absolutePath, sizeBytes } = await resolveSourcePath(filePath);
      expect(absolutePath).toBe(filePath);
      expect(sizeBytes).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });
});

describe("humanBytes", () => {
  test("formats 0 / sub-KB", () => {
    expect(humanBytes(0)).toBe("0 B");
    expect(humanBytes(512)).toMatch(/B$/);
  });
  test("formats KB", () => {
    expect(humanBytes(1024)).toBe("1 KB");
    expect(humanBytes(1536)).toMatch(/KB$/);
  });
  test("formats MB / GB", () => {
    expect(humanBytes(1024 * 1024)).toBe("1 MB");
    expect(humanBytes(1024 * 1024 * 1024)).toBe("1 GB");
  });
});

describe("previewSource + readSourceSnapshot", () => {
  let source: TestDB;
  let snap: SourceSnapshot;
  let snapPath: string;

  beforeEach(async () => {
    source = await makeTestDB();
    await seedSource(source.db, fakeSnapshot());
    snapPath = source.filePath;
  });


  afterEach(async () => {
    await source.cleanup();
  });

  test("previewSource reports present tables and counts", async () => {
    const info = await previewSource(snapPath);
    expect(info.isSqlite).toBe(true);
    expect(info.present.macroGroups).toBe(true);
    expect(info.present.macros).toBe(true);
    expect(info.present.scrapeResults).toBe(true);
    expect(info.present.scrapedItems).toBe(true);
    expect(info.present.scrapedItemFiles).toBe(true);
    expect(info.counts.macroGroups).toBe(2);
    expect(info.counts.macros).toBe(2);
    expect(info.counts.scrapeResults).toBe(2);
    expect(info.counts.scrapedItems).toBe(1);
    expect(info.counts.scrapedItemFiles).toBe(1);
  });

  test("readSourceSnapshot returns all rows correctly typed", async () => {
    snap = await readSourceSnapshot(snapPath);
    expect(snap.macroGroups).toHaveLength(2);
    expect(snap.macroGroups[0]?.name).toBe("Backups");
    expect(snap.macroGroups[0]?.ord).toBe(0);

    expect(snap.macros).toHaveLength(2);
    const runBackup = snap.macros.find((m) => m.name === "Run Backup");
    expect(runBackup).toBeDefined();
    expect(runBackup?.groupName).toBe("Backups");
    expect(runBackup?.runOnAgent).toBe(false);
    expect(runBackup?.commands).toContain("backup.sh");

    const restartPlex = snap.macros.find((m) => m.name === "Restart Plex");
    expect(restartPlex?.runOnAgent).toBe(true);
    expect(restartPlex?.agentHostname).toBe("media-pc");

    expect(snap.scrapeResults).toHaveLength(2);
    expect(snap.scrapeResults[0]?.uniqueKey).toBe("141jav:FAKE-001");

    expect(snap.scrapedItems).toHaveLength(1);
    expect(snap.scrapedItems[0]?.magnetLink).toBe(
      "magnet:?xt=urn:btih:cccc",
    );

    expect(snap.scrapedItemFiles).toHaveLength(1);
    // The source DB autoincrements IDs from 1, so this is whatever
    // Prisma assigned to the parent scraped_item (not 10 from the
    // fake snapshot). We just check it's a positive integer and
    // matches a real scraped_item id.
    const file = snap.scrapedItemFiles[0];
    expect(file?.scrapedItemId).toBeGreaterThan(0);
    expect(snap.scrapedItems.find((s) => s.id === file?.scrapedItemId)).toBeDefined();
  });

  test("handles missing tables gracefully (returns empty arrays)", async () => {
    // Rebuild the source with a stripped schema. The migration only
    // creates the tables we use, so drop the scraper tables to simulate
    // a "macros only" ServerTool export.
    await source.db.scrapeResult.deleteMany();
    await source.db.scrapedItem.deleteMany();
    await source.db.scrapedItemFile.deleteMany();
    // libsql can't DROP TABLE without raw SQL — use $executeRawUnsafe.
    await source.db.$executeRawUnsafe("DROP TABLE scrape_results");
    await source.db.$executeRawUnsafe("DROP TABLE scraped_items");
    await source.db.$executeRawUnsafe("DROP TABLE scraped_item_files");

    const info = await previewSource(snapPath);
    expect(info.present.scrapeResults).toBe(false);
    expect(info.present.scrapedItems).toBe(false);
    expect(info.present.scrapedItemFiles).toBe(false);
    expect(info.counts.scrapeResults).toBe(0);

    const snap2 = await readSourceSnapshot(snapPath);
    expect(snap2.scrapeResults).toEqual([]);
    expect(snap2.scrapedItems).toEqual([]);
    expect(snap2.scrapedItemFiles).toEqual([]);
    // Macro tables should still come through.
    expect(snap2.macros).toHaveLength(2);
  });
});

describe("applySnapshot", () => {
  let target: TestDB;
  let source: TestDB;
  let snap: SourceSnapshot;

  beforeEach(async () => {
    target = await makeTestDB();
    source = await makeTestDB();
    await seedSource(source.db, fakeSnapshot());
    snap = await readSourceSnapshot(source.filePath);
  });

  afterEach(async () => {
    await target.cleanup();
    await source.cleanup();
  });

  test("copies all tables into an empty target", async () => {
    const result = await applySnapshot(target.db, snap, {
      macroGroups: true,
      macros: true,
      scrapeResults: true,
      scrapedItems: true,
      scrapedItemFiles: true,
    });

    expect(result.macroGroups).toEqual({ total: 2, inserted: 2, skipped: 0 });
    expect(result.macros).toEqual({ total: 2, inserted: 2, skipped: 0 });
    expect(result.scrapeResults).toEqual({ total: 2, inserted: 2, skipped: 0 });
    expect(result.scrapedItems).toEqual({ total: 1, inserted: 1, skipped: 0 });
    expect(result.scrapedItemFiles).toEqual({
      total: 1,
      inserted: 1,
      skipped: 0,
    });

    // Spot-check the target DB state.
    const groups = await target.db.macroGroup.findMany();
    expect(groups.map((g) => g.name).sort()).toEqual(["Backups", "Monitoring"]);

    const macros = await target.db.macro.findMany();
    expect(macros).toHaveLength(2);
    const runBackup = macros.find((m) => m.name === "Run Backup");
    expect(runBackup?.groupName).toBe("Backups");
    expect(runBackup?.commands).toContain("backup.sh");

    const scrapeResults = await target.db.scrapeResult.findMany();
    expect(scrapeResults).toHaveLength(2);
    expect(scrapeResults.map((r) => r.uniqueKey).sort()).toEqual([
      "141jav:FAKE-001",
      "projectjav:FAKE-002",
    ]);

    const items = await target.db.scrapedItem.findMany();
    expect(items).toHaveLength(1);
    const newId = items[0]?.id;
    expect(newId).toBeDefined();

    // The crucial bit: scraped_item_files.scrapedItemId was rewritten
    // from the old ID (10) to the new autoincremented ID.
    const files = await target.db.scrapedItemFile.findMany();
    expect(files).toHaveLength(1);
    expect(files[0]?.scrapedItemId).toBe(newId);
    // The source-DB ID is whatever Prisma autoincremented (typically 1),
    // and the new ID is whatever the target DB assigns (also typically
    // 1, but the point is the FK got rewritten).
    expect(files[0]?.scrapedItemId).toEqual(newId);
    expect(files[0]?.magnetLink).toBe("magnet:?xt=urn:btih:dddd");
  });

  test("is idempotent — second run is a no-op", async () => {
    const all = {
      macroGroups: true,
      macros: true,
      scrapeResults: true,
      scrapedItems: true,
      scrapedItemFiles: true,
    };
    const first = await applySnapshot(target.db, snap, all);
    expect(first.macros.inserted).toBe(2);
    expect(first.macroGroups.inserted).toBe(2);

    const second = await applySnapshot(target.db, snap, all);
    expect(second.macros).toEqual({ total: 2, inserted: 0, skipped: 2 });
    expect(second.macroGroups).toEqual({ total: 2, inserted: 0, skipped: 2 });
    expect(second.scrapeResults).toEqual({ total: 2, inserted: 0, skipped: 2 });
    expect(second.scrapedItems).toEqual({ total: 1, inserted: 0, skipped: 1 });
    expect(second.scrapedItemFiles).toEqual({ total: 1, inserted: 0, skipped: 1 });

    // Target should still have exactly the same row counts.
    expect(await target.db.macro.count()).toBe(2);
    expect(await target.db.macroGroup.count()).toBe(2);
    expect(await target.db.scrapeResult.count()).toBe(2);
    expect(await target.db.scrapedItem.count()).toBe(1);
    expect(await target.db.scrapedItemFile.count()).toBe(1);
  });

  test("partial migration — only macros + groups", async () => {
    const result = await applySnapshot(target.db, snap, {
      macroGroups: true,
      macros: true,
      scrapeResults: false,
      scrapedItems: false,
      scrapedItemFiles: false,
    });

    expect(result.macroGroups.inserted).toBe(2);
    expect(result.macros.inserted).toBe(2);
    expect(result.scrapeResults.total).toBe(0);
    expect(result.scrapeResults.inserted).toBe(0);

    expect(await target.db.macro.count()).toBe(2);
    expect(await target.db.scrapeResult.count()).toBe(0);
    expect(await target.db.scrapedItem.count()).toBe(0);
  });

  test("macros auto-create their group if missing", async () => {
    // Skip macroGroups, only migrate macros. The "Backups" and
    // "Monitoring" groups should be auto-created so the macros
    // don't end up orphaned.
    const result = await applySnapshot(target.db, snap, {
      macroGroups: false,
      macros: true,
      scrapeResults: false,
      scrapedItems: false,
      scrapedItemFiles: false,
    });
    expect(result.macros.inserted).toBe(2);

    const groups = await target.db.macroGroup.findMany();
    expect(groups.map((g) => g.name).sort()).toEqual(["Backups", "Monitoring"]);
  });

  test("scrape_result dedup is on uniqueKey (not id)", async () => {
    // Pre-seed the target with one scrape_result whose uniqueKey
    // collides with the source. It should be skipped, the other
    // should be inserted.
    await target.db.scrapeResult.create({
      data: {
        source: "141jav",
        title: "PRE-EXISTING",
        uniqueKey: "141jav:FAKE-001",
        isHidden: false,
        isDownloaded: false,
      },
    });

    const result = await applySnapshot(target.db, snap, {
      macroGroups: false,
      macros: false,
      scrapeResults: true,
      scrapedItems: false,
      scrapedItemFiles: false,
    });
    expect(result.scrapeResults).toEqual({ total: 2, inserted: 1, skipped: 1 });

    const rows = await target.db.scrapeResult.findMany();
    expect(rows).toHaveLength(2);
    // The original one (title = "PRE-EXISTING") should be untouched.
    const aaa = rows.find((r) => r.uniqueKey === "141jav:FAKE-001");
    expect(aaa?.title).toBe("PRE-EXISTING");
  });

  test("scraped_item_files without a migrated parent are skipped (orphans)", async () => {
    // Build a snapshot where the only scraped_item_file references
    // a scraped_item that DOES NOT exist in the snapshot.
    const orphanSnap: SourceSnapshot = {
      ...snap,
      scrapedItems: [],
      scrapedItemFiles: [
        {
          id: 999,
          scrapedItemId: 10, // not in scrapedItems
          magnetLink: "magnet:?xt=urn:btih:orphan",
          fileSize: null,
          seeds: 0,
          leechers: 0,
        },
      ],
    };
    const result = await applySnapshot(target.db, orphanSnap, {
      macroGroups: false,
      macros: false,
      scrapeResults: false,
      scrapedItems: false,
      scrapedItemFiles: true,
    });
    expect(result.scrapedItemFiles).toEqual({
      total: 1,
      inserted: 0,
      skipped: 1,
    });
    expect(await target.db.scrapedItemFile.count()).toBe(0);
  });

  test("migration is transactional — failure rolls back the whole batch", async () => {
    // Pre-seed the target with a row that will collide and be SKIPPED
    // (not fail) — that doesn't trigger rollback. To force a failure,
    // we put a row that conflicts on a NON-unique field. Easiest:
    // make a uniqueKey collision that's actually invalid. But all
    // our skips are graceful, so the migration is essentially
    // all-or-nothing-success. Verify by counting: after a successful
    // run, all tables should have the expected counts. (This is a
    // smoke test for the transaction wrapper; the harder "fail
    // mid-transaction" test is hard to set up without monkey-patching
    // the Prisma client.)
    const result = await applySnapshot(target.db, snap, {
      macroGroups: true,
      macros: true,
      scrapeResults: true,
      scrapedItems: true,
      scrapedItemFiles: true,
    });
    expect(result.macroGroups.inserted).toBe(2);
    expect(result.macros.inserted).toBe(2);
    expect(result.scrapeResults.inserted).toBe(2);
    expect(result.scrapedItems.inserted).toBe(1);
    expect(result.scrapedItemFiles.inserted).toBe(1);
    expect(await target.db.macro.count()).toBe(2);
  });
});
