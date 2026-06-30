#!/usr/bin/env bun
/**
 * Special cleaner — delete small files (<75 MB) and empty directories
 * under the configured "special" media paths.
 *
 * Mirrors the Go agent: walks every subdir of MEDIA_BASE_PATH/special,
 * removes any regular file below 75 MB, removes any empty directory
 * after the file sweep. Symlinks are left alone (debrid-cleaner and
 * broken-link-finder handle those).
 *
 * Usage:
 *   just script scripts/media/special-cleaner.ts              # dry run
 *   just script scripts/media/special-cleaner.ts -- --delete  # actually rm
 *   just script scripts/media/special-cleaner.ts -- --threshold 50 --workers 8
 *
 * Env:
 *   MEDIA_BASE_PATH
 */

import { lstat, readdir, rm } from "fs/promises";
import { join } from "path";
import { getConfig } from "@/lib/config";
import { parseArgs } from "../_lib/cli";
import { humanBytes } from "../_lib/format";
import { banner, error, info, summary, warn } from "../_lib/log";

export const DEFAULT_THRESHOLD_MB = 75;

/**
 * Pure helpers — exported for unit testing.
 *
 * The cleanup logic boils down to: a file is "small" if its size is
 * strictly between 0 and the threshold. Zero-byte files are skipped
 * (they're usually placeholder symlinks, handled by broken-link-finder)
 * and the threshold is exclusive.
 */
export function mbToBytes(thresholdMB: number): number {
  return thresholdMB * 1024 * 1024;
}

export function isSmallFile(size: number, cutoff: number): boolean {
  return size > 0 && size < cutoff;
}

async function main() {
  const args = parseArgs({
    delete: { type: "boolean", default: false },
    threshold: { type: "number", default: DEFAULT_THRESHOLD_MB },
    workers: { type: "number", default: 4 },
  });
  banner("Special cleaner", { dryRun: !args.delete });

  const cfg = getConfig();
  const root = join(cfg.mediaBasePath, "special");
  info(`Scanning: ${root}`);
  info(`Threshold: ${args.threshold} MB`);
  info(`Workers: ${args.workers}`);

  const cutoff = mbToBytes(args.threshold);
  const candidates: string[] = [];
  try {
    await walk(root, cutoff, candidates);
  } catch (err) {
    error(`Walk failed: ${(err as Error).message}`);
    process.exit(1);
  }

  info(`Small files found: ${candidates.length}`);

  let removed = 0;
  let bytesReclaimed = 0;
  // Simple bounded-parallel sweep.
  const queue = [...candidates];
  await Promise.all(
    Array.from({ length: args.workers }, async () => {
      while (queue.length > 0) {
        const path = queue.shift();
        if (!path) break;
        try {
          const st = await lstat(path);
          if (!st.isFile()) continue;
          if (args.delete) {
            await rm(path, { force: true });
            removed++;
            bytesReclaimed += st.size;
          } else {
            info(`  would remove: ${path} (${humanBytes(st.size)})`);
          }
        } catch (err) {
          warn(`Failed on ${path}: ${(err as Error).message}`);
        }
      }
    }),
  );

  // Now sweep empty dirs, bottom-up. Re-walk because deletions may
  // have created new empties.
  const emptyDirs: string[] = [];
  try {
    await walkEmpty(root, emptyDirs);
  } catch (err) {
    warn(`Empty-dir walk failed: ${(err as Error).message}`);
  }
  for (const dir of emptyDirs) {
    if (args.delete) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch (err) {
        warn(`Failed to remove empty dir ${dir}: ${(err as Error).message}`);
      }
    } else {
      info(`  would remove empty dir: ${dir}`);
    }
  }

  summary({
    "Small files:": candidates.length,
    "Empty dirs:": emptyDirs.length,
    "Removed:": removed,
    "Bytes reclaimed:": humanBytes(bytesReclaimed),
    "Mode:": args.delete ? "LIVE" : "DRY RUN",
  });
}

async function walk(dir: string, cutoff: number, out: string[]) {
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, cutoff, out);
    } else if (e.isFile()) {
      try {
        const st = await lstat(full);
        if (isSmallFile(st.size, cutoff)) out.push(full);
      } catch {
        // ignore
      }
    }
  }
}

async function walkEmpty(dir: string, out: string[]) {
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = join(dir, e.name);
    await walkEmpty(full, out);
  }
  try {
    const remaining = await readdir(dir);
    if (remaining.length === 0) out.push(dir);
  } catch {
    // gone — that's fine
  }
}

if (import.meta.main) {
  main().catch((err) => {
    error("special-cleaner failed", err);
    process.exit(1);
  });
}
