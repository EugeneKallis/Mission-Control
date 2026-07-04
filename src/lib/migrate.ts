/**
 * Migrate data from an existing ServerTool SQLite database into the
 * current Mission Control database.
 *
 * The ServerTool schema and the Mission Control schema are
 * **identical** for the tables we copy (macros, macro_groups,
 * scrape_results, scraped_items, scraped_item_files), so this is a
 * straight row copy with idempotency on the natural keys.
 *
 * Read path: open the user-supplied DB file with `@libsql/client`
 * in read-only mode (`?mode=ro`). This works even while ServerTool
 * is running and writing WAL — the libsql client reads from the
 * WAL without taking a write lock.
 *
 * Write path: a single Prisma `$transaction` on the target DB.
 * Per-row idempotency:
 *
 *   - macro_groups  → skip if a group with the same name already exists
 *   - macros        → skip if a macro with the same (name, groupName) exists
 *   - scrape_results → skip if a row with the same uniqueKey already exists
 *   - scraped_items → skip if a row with the same magnetLink already exists
 *   - scraped_item_files → skip if (scrapedItemId, magnetLink) already exists
 *
 * `scraped_item_files.scrapedItemId` is rebuilt from a map of
 * old-ID → new-ID (the IDs are not preserved across DBs because
 * each DB autoincrements from 1).
 */

import { createClient, type Client } from "@libsql/client";
import { readFile, stat } from "fs/promises";
import { resolve, isAbsolute } from "path";
import type { PrismaClient } from "@prisma/client";
import { humanReadableSize as humanBytes } from "@/lib/format";

// ── Public types ─────────────────────────────────────────────────────────

/** What the page needs to show before the user clicks "Migrate". */
export interface SourceInfo {
  dbPath: string;
  dbSizeBytes: number;
  /** Which tables were present in the source DB. */
  present: {
    macroGroups: boolean;
    macros: boolean;
    scrapeResults: boolean;
    scrapedItems: boolean;
    scrapedItemFiles: boolean;
  };
  /** Row counts for the present tables. Missing tables report 0. */
  counts: {
    macroGroups: number;
    macros: number;
    scrapeResults: number;
    scrapedItems: number;
    scrapedItemFiles: number;
  };
  /** True iff the file looks like a SQLite DB. */
  isSqlite: boolean;
}

/** A single source row, as we read it. */
export interface SourceMacroGroup {
  id: number;
  name: string;
  ord: number;
}

export interface SourceMacro {
  id: number;
  name: string;
  description: string;
  groupName: string;
  ord: number;
  runOnAgent: boolean;
  agentHostname: string;
  commands: string;
}

export interface SourceScrapeResult {
  id: number;
  source: string;
  title: string;
  imageUrl: string | null;
  magnetLink: string | null;
  torrentLink: string | null;
  uniqueKey: string;
  infoHash: string | null;
  fileSize: string | null;
  tags: string | null;
}

export interface SourceScrapedItem {
  id: number;
  source: string;
  title: string;
  imageUrl: string | null;
  magnetLink: string;
  torrentLink: string | null;
  tags: string | null;
}

export interface SourceScrapedItemFile {
  id: number;
  scrapedItemId: number;
  magnetLink: string;
  fileSize: string | null;
  seeds: number;
  leechers: number;
}

/** Everything read from the source DB. */
export interface SourceSnapshot {
  macroGroups: SourceMacroGroup[];
  macros: SourceMacro[];
  scrapeResults: SourceScrapeResult[];
  scrapedItems: SourceScrapedItem[];
  scrapedItemFiles: SourceScrapedItemFile[];
}

/** Per-table breakdown returned by `applySnapshot`. */
export interface TableStats {
  total: number;
  inserted: number;
  skipped: number;
}

export interface MigrationResult {
  macroGroups: TableStats;
  macros: TableStats;
  scrapeResults: TableStats;
  scrapedItems: TableStats;
  scrapedItemFiles: TableStats;
}

/** Which tables to copy. Each flag toggles one source table. */
export interface MigrationOptions {
  macroGroups: boolean;
  macros: boolean;
  scrapeResults: boolean;
  scrapedItems: boolean;
  scrapedItemFiles: boolean;
}

// ── Source DB plumbing ───────────────────────────────────────────────────

/**
 * The first 16 bytes of any SQLite database file.
 * `b"SQLite format 3\0"`. Used to validate a path before opening it.
 */
const SQLITE_HEADER = Buffer.from([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61,
  0x74, 0x20, 0x33, 0x00,
]);

/**
 * Thrown when the user-supplied path is not a readable SQLite database
 * file. The API route catches this and returns a 400 with the message.
 */
export class SourceDbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceDbError";
  }
}

/**
 * Normalize and validate a user-supplied DB path. Returns the absolute
 * path on success; throws {@link SourceDbError} on any problem.
 *
 * Validation steps (in order):
 *   1. Resolve to an absolute path.
 *   2. Stat the file (must exist, must be a regular file).
 *   3. Read the first 16 bytes; reject anything that is not a SQLite
 *      database (this is what rejects directories, text files, .db-shm
 *      and .db-wal sidecar files, etc.).
 */
export async function resolveSourcePath(rawPath: string): Promise<{
  absolutePath: string;
  sizeBytes: number;
}> {
  if (!rawPath || typeof rawPath !== "string") {
    throw new SourceDbError("A database path is required");
  }
  const trimmed = rawPath.trim();
  if (!trimmed) throw new SourceDbError("A database path is required");
  // tilde expansion
  const expanded = trimmed.startsWith("~")
    ? trimmed.replace(/^~/, process.env.HOME ?? "")
    : trimmed;
  const absolutePath = isAbsolute(expanded)
    ? expanded
    : resolve(process.cwd(), expanded);
  let stats;
  try {
    stats = await stat(absolutePath);
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      throw new SourceDbError(`File not found: ${absolutePath}`);
    }
    throw new SourceDbError(
      `Cannot read path: ${e?.message ?? "unknown error"}`,
    );
  }
  if (!stats.isFile()) {
    throw new SourceDbError(
      `Path is not a file (likely a directory): ${absolutePath}`,
    );
  }
  // Validate the SQLite header. This also rejects .db-shm and .db-wal
  // sidecar files, which are not valid standalone databases.
  let head: Buffer;
  try {
    const fh = await readFile(absolutePath);
    head = fh.subarray(0, 16);
  } catch (e: any) {
    throw new SourceDbError(`Cannot read file: ${e?.message ?? "unknown"}`);
  }
  if (head.length < 16 || !head.equals(SQLITE_HEADER)) {
    throw new SourceDbError(
      `Not a SQLite database file (missing SQLite header): ${absolutePath}`,
    );
  }
  return { absolutePath, sizeBytes: stats.size };
}

/**
 * Open the user-supplied DB file.
 *
 * The libsql JS client does not expose a read-only mode at the URL
 * layer (its URL query whitelist only knows `tls` and `authToken`),
 * so we open the file in normal read-write mode and never issue a
 * write. SQLite's locking allows multiple processes to have a DB
 * open concurrently as long as only one writes; ServerTool holds
 * the writer lock on the source DB while our process holds a
 * read connection and never issues a write.
 */
export async function openSourceClient(absolutePath: string): Promise<Client> {
  return createClient({ url: `file:${absolutePath}` });
}

/**
 * Return the list of user-table names present in the source DB.
 * Excludes SQLite internals (anything starting with `sqlite_`).
 */
async function listUserTables(client: Client): Promise<Set<string>> {
  const res = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  return new Set(res.rows.map((r) => String(r.name)));
}

/**
 * Whitelist check before building a `SELECT ... FROM <name>` query.
 * (Identifiers can't be bound, so this is the defense against
 * injection from a misbehaving caller.)
 */
function assertSafeTable(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to query unsafe table identifier: ${name}`);
  }
}

async function countTable(client: Client, table: string): Promise<number> {
  assertSafeTable(table);
  const res = await client.execute(`SELECT COUNT(*) AS c FROM "${table}"`);
  return Number(res.rows[0]?.c ?? 0);
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Probe the source DB and return table presence + counts.
 * Read-only — does not write to either DB.
 *
 * Throws {@link SourceDbError} on bad path / not-SQLite.
 */
export async function previewSource(rawPath: string): Promise<SourceInfo> {
  const { absolutePath, sizeBytes } = await resolveSourcePath(rawPath);
  const client = await openSourceClient(absolutePath);
  try {
    const tables = await listUserTables(client);
    const present = {
      macroGroups: tables.has("macro_groups"),
      macros: tables.has("macros"),
      scrapeResults: tables.has("scrape_results"),
      scrapedItems: tables.has("scraped_items"),
      scrapedItemFiles: tables.has("scraped_item_files"),
    };
    const counts = {
      macroGroups: present.macroGroups
        ? await countTable(client, "macro_groups")
        : 0,
      macros: present.macros ? await countTable(client, "macros") : 0,
      scrapeResults: present.scrapeResults
        ? await countTable(client, "scrape_results")
        : 0,
      scrapedItems: present.scrapedItems
        ? await countTable(client, "scraped_items")
        : 0,
      scrapedItemFiles: present.scrapedItemFiles
        ? await countTable(client, "scraped_item_files")
        : 0,
    };
    return { dbPath: absolutePath, dbSizeBytes: sizeBytes, present, counts, isSqlite: true };
  } finally {
    client.close();
  }
}

/**
 * Read all rows from the source DB. Read-only.
 *
 * Tables missing from the source are returned as empty arrays
 * (the caller still decides via {@link MigrationOptions} which
 * tables to actually copy).
 */
export async function readSourceSnapshot(rawPath: string): Promise<SourceSnapshot> {
  const { absolutePath } = await resolveSourcePath(rawPath);
  const client = await openSourceClient(absolutePath);
  try {
    const tables = await listUserTables(client);

    const macroGroups: SourceMacroGroup[] = tables.has("macro_groups")
      ? (
          await client.execute(
            'SELECT id, name, ord FROM "macro_groups" ORDER BY ord ASC, id ASC',
          )
        ).rows.map((r) => ({
          id: Number(r.id),
          name: String(r.name),
          ord: Number(r.ord ?? 0),
        }))
      : [];

    const macros: SourceMacro[] = tables.has("macros")
      ? (
          await client.execute(
            `SELECT id, name, description, group_name, ord, run_on_agent, agent_hostname, commands
             FROM "macros"
             ORDER BY ord ASC, id ASC`,
          )
        ).rows.map((r) => ({
          id: Number(r.id),
          name: String(r.name),
          description: String(r.description ?? ""),
          groupName: String(r.group_name ?? "Ungrouped"),
          ord: Number(r.ord ?? 0),
          runOnAgent: Number(r.run_on_agent ?? 0) !== 0,
          agentHostname: String(r.agent_hostname ?? ""),
          commands: String(r.commands ?? "[]"),
        }))
      : [];

    const scrapeResults: SourceScrapeResult[] = tables.has("scrape_results")
      ? (
          await client.execute(
            `SELECT id, source, title, image_url, magnet_link, torrent_link,
                    unique_key, info_hash, file_size, tags
             FROM "scrape_results"
             ORDER BY id ASC`,
          )
        ).rows.map((r) => ({
          id: Number(r.id),
          source: String(r.source ?? ""),
          title: String(r.title ?? ""),
          imageUrl: r.image_url == null ? null : String(r.image_url),
          magnetLink: r.magnet_link == null ? null : String(r.magnet_link),
          torrentLink: r.torrent_link == null ? null : String(r.torrent_link),
          uniqueKey: String(r.unique_key ?? ""),
          infoHash: r.info_hash == null ? null : String(r.info_hash),
          fileSize: r.file_size == null ? null : String(r.file_size),
          tags: r.tags == null ? null : String(r.tags),
        }))
      : [];

    const scrapedItems: SourceScrapedItem[] = tables.has("scraped_items")
      ? (
          await client.execute(
            `SELECT id, source, title, image_url, magnet_link, torrent_link, tags
             FROM "scraped_items"
             ORDER BY id ASC`,
          )
        ).rows.map((r) => ({
          id: Number(r.id),
          source: String(r.source ?? "141jav"),
          title: String(r.title ?? ""),
          imageUrl: r.image_url == null ? null : String(r.image_url),
          magnetLink: String(r.magnet_link ?? ""),
          torrentLink: r.torrent_link == null ? null : String(r.torrent_link),
          tags: r.tags == null ? null : String(r.tags),
        }))
      : [];

    const scrapedItemFiles: SourceScrapedItemFile[] = tables.has("scraped_item_files")
      ? (
          await client.execute(
            `SELECT id, scraped_item_id, magnet_link, file_size, seeds, leechers
             FROM "scraped_item_files"
             ORDER BY id ASC`,
          )
        ).rows.map((r) => ({
          id: Number(r.id),
          scrapedItemId: Number(r.scraped_item_id),
          magnetLink: String(r.magnet_link ?? ""),
          fileSize: r.file_size == null ? null : String(r.file_size),
          seeds: Number(r.seeds ?? 0),
          leechers: Number(r.leechers ?? 0),
        }))
      : [];

    return {
      macroGroups,
      macros,
      scrapeResults,
      scrapedItems,
      scrapedItemFiles,
    };
  } finally {
    client.close();
  }
}

/**
 * Apply a source snapshot to the target DB. Idempotent.
 *
 * All writes happen inside a single Prisma transaction so a partial
 * failure rolls back the whole migration.
 *
 * Returns per-table { total, inserted, skipped } so the UI can show
 * "Copied 3 macro groups (12 skipped), 45 macros (0 skipped)".
 */
export async function applySnapshot(
  target: PrismaClient,
  snapshot: SourceSnapshot,
  options: MigrationOptions,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    macroGroups: { total: 0, inserted: 0, skipped: 0 },
    macros: { total: 0, inserted: 0, skipped: 0 },
    scrapeResults: { total: 0, inserted: 0, skipped: 0 },
    scrapedItems: { total: 0, inserted: 0, skipped: 0 },
    scrapedItemFiles: { total: 0, inserted: 0, skipped: 0 },
  };

  await target.$transaction(async (tx) => {
    // 1. macro_groups ───────────────────────────────────────────────
    if (options.macroGroups) {
      for (const g of snapshot.macroGroups) {
        result.macroGroups.total++;
        const existing = await tx.macroGroup.findUnique({
          where: { name: g.name },
        });
        if (existing) {
          result.macroGroups.skipped++;
          continue;
        }
        await tx.macroGroup.create({
          data: { name: g.name, ord: g.ord },
        });
        result.macroGroups.inserted++;
      }
    }

    // 2. macros ─────────────────────────────────────────────────────
    // Macros reference their group by *name* (groupName column).
    // If the group doesn't exist yet, the relation is implicit (we
    // don't have a foreign key on the column) so the macro will end
    // up pointing to a group that needs creating via the admin UI
    // (or the user can re-run migration with macroGroups enabled).
    if (options.macros) {
      for (const m of snapshot.macros) {
        result.macros.total++;
        const existing = await tx.macro.findFirst({
          where: { name: m.name, groupName: m.groupName },
        });
        if (existing) {
          result.macros.skipped++;
          continue;
        }
        // Make sure the group exists. If the user didn't ask us to
        // copy groups, create the missing group on the fly so the
        // macro doesn't end up in "Ungrouped" unintentionally.
        if (m.groupName && m.groupName !== "Ungrouped") {
          const grp = await tx.macroGroup.findUnique({
            where: { name: m.groupName },
          });
          if (!grp) {
            const maxOrd = await tx.macroGroup.count();
            await tx.macroGroup.create({
              data: { name: m.groupName, ord: maxOrd },
            });
          }
        }
        await tx.macro.create({
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
        result.macros.inserted++;
      }
    }

    // 3. scrape_results ────────────────────────────────────────────
    if (options.scrapeResults) {
      for (const r of snapshot.scrapeResults) {
        result.scrapeResults.total++;
        if (!r.uniqueKey) {
          // Defensive: a row with no uniqueKey can't be deduped.
          result.scrapeResults.skipped++;
          continue;
        }
        const existing = await tx.scrapeResult.findUnique({
          where: { uniqueKey: r.uniqueKey },
        });
        if (existing) {
          result.scrapeResults.skipped++;
          continue;
        }
        await tx.scrapeResult.create({
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
            isHidden: false,
            isDownloaded: false,
          },
        });
        result.scrapeResults.inserted++;
      }
    }

    // 4. scraped_items ─────────────────────────────────────────────
    // Build the old→new id map as we go, so step 5 can rewrite the
    // scraped_item_files.scraped_item_id foreign keys.
    const itemIdMap = new Map<number, number>();
    if (options.scrapedItems) {
      for (const s of snapshot.scrapedItems) {
        result.scrapedItems.total++;
        if (!s.magnetLink) {
          result.scrapedItems.skipped++;
          continue;
        }
        const existing = await tx.scrapedItem.findUnique({
          where: { magnetLink: s.magnetLink },
        });
        if (existing) {
          result.scrapedItems.skipped++;
          itemIdMap.set(s.id, existing.id);
          continue;
        }
        const created = await tx.scrapedItem.create({
          data: {
            source: s.source,
            title: s.title,
            imageUrl: s.imageUrl,
            magnetLink: s.magnetLink,
            torrentLink: s.torrentLink,
            tags: s.tags,
            isHidden: false,
            isDownloaded: false,
          },
        });
        result.scrapedItems.inserted++;
        itemIdMap.set(s.id, created.id);
      }
    }

    // 5. scraped_item_files ────────────────────────────────────────
    if (options.scrapedItemFiles) {
      for (const f of snapshot.scrapedItemFiles) {
        result.scrapedItemFiles.total++;
        const newItemId = itemIdMap.get(f.scrapedItemId);
        if (!newItemId) {
          // Orphan file (parent item not migrated / not found) — skip.
          result.scrapedItemFiles.skipped++;
          continue;
        }
        const existing = await tx.scrapedItemFile.findUnique({
          where: {
            scrapedItemId_magnetLink: {
              scrapedItemId: newItemId,
              magnetLink: f.magnetLink,
            },
          },
        });
        if (existing) {
          result.scrapedItemFiles.skipped++;
          continue;
        }
        await tx.scrapedItemFile.create({
          data: {
            scrapedItemId: newItemId,
            magnetLink: f.magnetLink,
            fileSize: f.fileSize,
            seeds: f.seeds,
            leechers: f.leechers,
          },
        });
        result.scrapedItemFiles.inserted++;
      }
    }
  });

  return result;
}


