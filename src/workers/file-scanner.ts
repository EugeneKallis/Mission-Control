#!/usr/bin/env bun
/**
 * File-tree scanner worker.
 *
 * Walks the configured media directories, finds symlinks whose targets start with
 * the NZB or debrid addons prefix, and upserts them into the nzb_files / debrid_files
 * tables so the NZB/Debrid viewer pages can render their trees.
 *
 * Runs once and exits. Schedule via systemd timer or crontab (the plan recommends
 * every few minutes — far simpler than the original fsnotify watcher).
 *
 *   just run-worker src/workers/file-scanner.ts
 *
 * Env vars:
 *   CLEANUP_OLD=true  — delete rows whose updatedAt is older than this run
 *                       (i.e. files that no longer exist on disk). Default off so
 *                       a dev machine with no media path doesn't wipe the table.
 *   DRY_RUN=1         — walk + log, but make no DB writes. Useful for verifying
 *                       the walk finds the expected symlinks before running for real.
 */

import { promises as fs } from "fs";
import { basename, dirname, join, relative, sep } from "path";
import {
  upsertNzbFile,
  upsertDebridFile,
  deleteNzbFilesOlderThan,
  deleteDebridFilesOlderThan,
} from "@/lib/db/queries";
import { getConfig } from "@/lib/config";

// ── Constants (mirror scanner.go) ─────────────────────────────────────────

const NZB_TARGET_PREFIX = "/mnt/addons/nzbdav";
const DEBRID_TARGET_PREFIX = "/mnt/addons/debrid";

/** Max parallel file-system operations. */
const CONCURRENCY = 16;

/** Log progress every N entries. */
const PROGRESS_EVERY = 100;

// ── Types ────────────────────────────────────────────────────────────────

type Source = "nzb" | "debrid";

interface ScanEntry {
  path: string; // relative to mediaBasePath
  name: string;
  parentPath: string; // "" for top-level media dirs
  isDir: boolean;
  linkTarget: string | null;
  source: Source; // which table it belongs to
}

interface UpsertResult {
  source: Source;
  entry: Omit<ScanEntry, "source">;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function classifyTarget(target: string): Source | null {
  if (target.startsWith(NZB_TARGET_PREFIX)) return "nzb";
  if (target.startsWith(DEBRID_TARGET_PREFIX)) return "debrid";
  return null;
}

function toPosix(p: string): string {
  // Prisma stores paths with forward slashes (matches the Go original).
  return p.split(sep).join("/");
}

function parentOf(p: string): string {
  // Mirrors Go: filepath.Dir("a/b/c") → "a/b", filepath.Dir("a") → "."
  if (!p.includes("/")) return ".";
  const idx = p.lastIndexOf("/");
  return idx === 0 ? "/" : p.slice(0, idx);
}

function emptyToEmpty(p: string): string {
  // Go converts filepath.Dir's "." to "" when storing in DB.
  return p === "." ? "" : p;
}

/** Concurrency-limited parallel map. */
async function pMap<T, U>(items: T[], fn: (item: T) => Promise<U>, concurrency: number): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Walk ────────────────────────────────────────────────────────────────

/**
 * Recursively walk `root` collecting scan entries. Mirrors `collectScanEntries` in
 * scanner.go: records symlinks whose target matches a known prefix, plus every
 * ancestor directory of each such symlink so the tree renders with full hierarchy.
 */
async function walkMedia(root: string, onProgress?: (count: number) => void): Promise<ScanEntry[]> {
  const entries: ScanEntry[] = [];
  const dirsSeen = new Set<string>();
  let processed = 0;

  async function walk(absDir: string, relDir: string): Promise<void> {
    let dirents;
    try {
      dirents = await fs.readdir(absDir, { withFileTypes: true });
    } catch (err) {
      // Unreadable directory — skip silently (matches Go's "return nil" on err)
      return;
    }

    for (const d of dirents) {
      const abs = join(absDir, d.name);
      const rel = relDir ? toPosix(join(relDir, d.name)) : d.name;

      if (d.isSymbolicLink()) {
        let linkDest: string;
        try {
          linkDest = await fs.readlink(abs);
        } catch {
          continue;
        }
        const source = classifyTarget(linkDest);
        if (!source) continue;

        // Ensure every ancestor directory is in the entry set
        let parent = parentOf(rel);
        while (parent !== "." && parent !== "/") {
          if (!dirsSeen.has(parent)) {
            dirsSeen.add(parent);
            entries.push({
              path: parent,
              name: basename(parent),
              parentPath: emptyToEmpty(parentOf(parent)),
              isDir: true,
              linkTarget: null,
              source,
            });
          }
          parent = parentOf(parent);
        }

        entries.push({
          path: rel,
          name: basename(rel),
          parentPath: emptyToEmpty(parentOf(rel)),
          isDir: false,
          linkTarget: linkDest,
          source,
        });

        processed++;
        if (onProgress && processed % PROGRESS_EVERY === 0) onProgress(processed);
      } else if (d.isDirectory()) {
        // Recurse into real directories (don't follow symlinks as dirs)
        await walk(abs, rel);
      }
      // Regular files are skipped — scanner only cares about nzb/debrid symlinks
    }
  }

  await walk(root, "");
  return entries;
}

// ── File counts ─────────────────────────────────────────────────────────

/**
 * Compute the recursive descendant-file count for every directory entry.
 * Mirrors `updateDirFileCountsFromEntries` in scanner.go.
 */
function computeFileCounts(entries: ScanEntry[]): Map<string, number> {
  const childrenOf = new Map<string, string[]>();
  const isDir = new Map<string, boolean>();

  for (const e of entries) {
    const arr = childrenOf.get(e.parentPath) ?? [];
    arr.push(e.path);
    childrenOf.set(e.parentPath, arr);
    isDir.set(e.path, e.isDir);
  }

  const cache = new Map<string, number>();
  const countFiles = (p: string): number => {
    const cached = cache.get(p);
    if (cached !== undefined) return cached;
    let total = 0;
    for (const child of childrenOf.get(p) ?? []) {
      if (isDir.get(child)) {
        total += countFiles(child);
      } else {
        total += 1;
      }
    }
    cache.set(p, total);
    return total;
  };

  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.isDir) {
      counts.set(e.path, countFiles(e.path));
    }
  }
  return counts;
}

// ── Upsert ──────────────────────────────────────────────────────────────

async function upsertEntry(
  result: UpsertResult,
  scanTime: Date,
  counts: Map<string, number>,
  dryRun: boolean
): Promise<{ source: Source; ok: boolean }> {
  const { source, entry } = result;
  const fileCount = entry.isDir ? counts.get(entry.path) ?? 0 : 0;

  if (dryRun) {
    return { source, ok: true };
  }

  try {
    if (source === "nzb") {
      await upsertNzbFile({
        path: entry.path,
        name: entry.name,
        isDir: entry.isDir,
        parentPath: entry.parentPath,
        linkTarget: entry.linkTarget,
        fileCount,
        updatedAt: scanTime,
      });
    } else {
      await upsertDebridFile({
        path: entry.path,
        name: entry.name,
        isDir: entry.isDir,
        parentPath: entry.parentPath,
        linkTarget: entry.linkTarget,
        fileCount,
        updatedAt: scanTime,
      });
    }
    return { source, ok: true };
  } catch (err) {
    console.error(`[file-scanner] upsert failed for ${entry.path}:`, err);
    return { source, ok: false };
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  const dryRun = process.env.DRY_RUN === "1";
  const cleanup = process.env.CLEANUP_OLD === "true";

  console.log(`[file-scanner] start at ${startedAt.toISOString()}${dryRun ? " (DRY RUN)" : ""}`);

  // Resolve media base path. fullMediaPaths returns one entry per configured media
  // directory; the walk should happen from the base so relative paths are consistent
  // (e.g. "movies/Foo.nzb" not "Foo.nzb").
  const cfg = getConfig();
  const basePath = cfg.mediaBasePath.replace(/\/+$/, "");
  if (!basePath) {
    console.warn("[file-scanner] MEDIA_BASE_PATH is empty — nothing to scan");
    return;
  }

  try {
    await fs.access(basePath);
  } catch {
    console.warn(
      `[file-scanner] scan root ${basePath} does not exist (normal on dev machines) — exiting cleanly`
    );
    return;
  }

  console.log(`[file-scanner] walking ${basePath} (subdirs: ${cfg.mediaDirectories.join(", ")})`);

  const walkStarted = Date.now();
  const entries = await walkMedia(basePath, (n) => {
    console.log(`[file-scanner] walk progress: ${n} symlinks discovered`);
  });
  const walkMs = Date.now() - walkStarted;

  const nzbCount = entries.filter((e) => e.source === "nzb").length;
  const debridCount = entries.filter((e) => e.source === "debrid").length;
  console.log(
    `[file-scanner] walk complete in ${walkMs}ms — ${entries.length} entries (nzb=${nzbCount}, debrid=${debridCount})`
  );

  if (entries.length === 0) {
    console.log("[file-scanner] no symlinks found — nothing to do");
    return;
  }

  // Compute recursive file counts for every directory in a single pass
  const counts = computeFileCounts(entries);

  // Upsert with bounded concurrency
  const upsertStarted = Date.now();
  const scanTime = new Date();
  const payloads: UpsertResult[] = entries.map((entry) => ({ source: entry.source, entry }));
  const results = await pMap(payloads, (p) => upsertEntry(p, scanTime, counts, dryRun), CONCURRENCY);
  const upsertMs = Date.now() - upsertStarted;

  let nzbOk = 0;
  let debridOk = 0;
  for (const r of results) {
    if (!r.ok) continue;
    if (r.source === "nzb") nzbOk++;
    else debridOk++;
  }
  console.log(
    `[file-scanner] upsert complete in ${upsertMs}ms — nzb=${nzbOk}, debrid=${debridOk}`
  );

  // Cleanup stale rows (those not seen this run, i.e. files removed from disk)
  if (cleanup && !dryRun) {
    try {
      const nzbDeleted = await deleteNzbFilesOlderThan(scanTime);
      const debridDeleted = await deleteDebridFilesOlderThan(scanTime);
      console.log(
        `[file-scanner] cleanup — removed nzb=${nzbDeleted.count}, debrid=${debridDeleted.count}`
      );
    } catch (err) {
      console.error("[file-scanner] cleanup failed:", err);
    }
  } else if (!cleanup) {
    console.log("[file-scanner] cleanup skipped (set CLEANUP_OLD=true to enable)");
  }

  const totalMs = Date.now() - startedAt.getTime();
  console.log(`[file-scanner] done in ${totalMs}ms`);
}

main().catch((err) => {
  console.error("[file-scanner] fatal:", err);
  process.exit(1);
});
