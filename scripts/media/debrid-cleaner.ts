#!/usr/bin/env bun
/**
 * Debrid cleaner — find rclone/debrid directories that no media
 * symlink references, and (optionally) delete them.
 *
 * Walks the rclone mount for top-level folders. For each, collects its
 * folder name. Then walks the media base path, follows symlinks, and
 * collects every debrid target path. Anything in the rclone mount that
 * is never a symlink target is "orphan" content — free disk space.
 *
 * Usage:
 *   just script scripts/media/debrid-cleaner.ts                    # dry run
 *   just script scripts/media/debrid-cleaner.ts -- --delete        # actually rm
 *   just script scripts/media/debrid-cleaner.ts -- --media-base-path /custom/media
 *   just script scripts/media/debrid-cleaner.ts -- --media-path /custom/media  # alias
 *
 * Env (consumed by AppConfig):
 *   RCLONE_PATH (default /mnt/addons/debrid/__all__)
 *   MEDIA_BASE_PATH (default /mnt/debrid/media/)
 *   MEDIA_DIRECTORIES (comma list, default movies,movies4k,...)
 */

import { lstat, readdir, readlink, rm } from "fs/promises";
import { join } from "path";
import { getConfig } from "@/lib/config";
import { parseArgs } from "../_lib/cli";
import { humanBytes } from "../_lib/format";
import { banner, error, info, summary, warn } from "../_lib/log";

export async function main(argv?: string[]) {
  const args = parseArgs(
    {
      delete: { type: "boolean", default: false },
      mediaBasePath: { type: "string", default: "", alias: "mediaPath" },
    },
    argv,
  );
  banner("Debrid cleaner", { dryRun: !args.delete });

  const cfg = getConfig();
  const rclonePath = cfg.rclonePath;
  const mediaRoot = args.mediaBasePath || cfg.mediaBasePath;
  const mediaDirs = cfg.mediaDirectories;

  info(`Rclone mount: ${rclonePath}`);
  info(`Media root:   ${mediaRoot}`);
  info(`Media dirs:   ${mediaDirs.join(", ")}`);

  // 1. Collect debrid folder names from the rclone mount.
  let rawFolders: string[];
  try {
    rawFolders = await readdir(rclonePath);
  } catch (err) {
    error(`Cannot read rclone mount ${rclonePath}`, err);
    process.exit(1);
  }
  // Guard against unexpected entries (path traversal via "/" in a folder
  // name, or the . / .. sentinels).
  const debridFolders = rawFolders.filter((f) => f.length > 0 && !f.includes("/") && f !== ".." && f !== ".");
  info(`Found ${debridFolders.length} debrid folder(s) in rclone mount`);

  // 2. Walk media dirs to find every symlink target. The rclone mount
  //    is `__all__/<FolderName>/<file>`, so we want the second-to-last
  //    path segment of each target — the <FolderName>, not the <file>.
  const referenced = new Set<string>();
  for (const dir of mediaDirs) {
    const root = join(mediaRoot, dir);
    try {
      await walkSymlinks(root, referenced);
    } catch (err) {
      warn(`Skipping ${root}: ${(err as Error).message}`);
    }
  }
  info(`Referenced debrid folders: ${referenced.size}`);

  // 3. Orphans = entries in rclone mount that are not referenced.
  const orphans = debridFolders.filter((f) => !referenced.has(f));
  info(`Orphan folders: ${orphans.length}`);

  let removed = 0;
  let bytesReclaimed = 0;
  for (const folder of orphans) {
    const full = join(rclonePath, folder);
    if (args.delete) {
      try {
        const size = await dirSize(full);
        await rm(full, { recursive: true, force: true });
        removed++;
        bytesReclaimed += size;
        info(`  removed: ${full}`);
      } catch (err) {
        warn(`Failed to remove ${full}: ${(err as Error).message}`);
      }
    } else {
      info(`  would remove: ${full}`);
    }
  }

  summary({
    "Orphans:": orphans.length,
    "Removed:": removed,
    "Bytes reclaimed:": humanBytes(bytesReclaimed),
    "Mode:": args.delete ? "LIVE" : "DRY RUN",
  });
}

/**
 * Walk a directory tree, following symlinks, and collect the rclone
 * folder name that each symlink points into. The rclone mount is
 * `__all__/<FolderName>/<file>`, so we extract the segment immediately
 * before the final filename.
 */
async function walkSymlinks(dir: string, out: Set<string>) {
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // missing dir is fine
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      try {
        const target = await readlink(full);
        const parts = target.split("/").filter(Boolean);
        const folder = parts.length >= 2 ? parts[parts.length - 2] : undefined;
        if (folder) out.add(folder);
      } catch {
        // broken symlink — ignore
      }
    } else if (entry.isDirectory()) {
      await walkSymlinks(full, out);
    }
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    try {
      if (e.isDirectory()) {
        total += await dirSize(full);
      } else {
        const st = await lstat(full);
        total += st.size;
      }
    } catch {
      // ignore
    }
  }
  return total;
}

if (import.meta.main) {
  main().catch((err) => {
    error("debrid-cleaner failed", err);
    process.exit(1);
  });
}

