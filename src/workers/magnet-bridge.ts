#!/usr/bin/env bun
/**
 * magnet-bridge — long-running Decypharr poller.
 *
 * Polls Decypharr for finished `special` torrents, cleans up small
 * symlinks (<75 MB) inside the content, moves the content into the
 * media library under `<MEDIA_BASE_PATH>/special`, and removes the
 * torrent from Decypharr once the move is done.
 *
 * Mirrors ~/ServerTool/cmd/magnet_bridge/main.go.
 *
 * Usage:
 *   just run-worker src/workers/magnet-bridge.ts
 *   just run-worker src/workers/magnet-bridge.ts -- --interval 10 --once
 *
 * Env (consumed by AppConfig):
 *   DECYPHARR_URL    (default http://192.168.1.99:8282)
 *   MEDIA_BASE_PATH  (default /mnt/debrid/media/)
 *
 * The worker runs forever unless `--once` is passed; stop with
 * SIGINT/SIGTERM.
 */

import { mkdir, readdir, rename, rm, stat, lstat } from "fs/promises";
import { basename, dirname, join } from "path";
import { DecypharrClient } from "@/lib/clients/decypharr";
import { getConfig } from "@/lib/config";
import { parseArgs } from "../../scripts/_lib/cli";
import { banner, info, warn } from "../../scripts/_lib/log";

const SPECIAL_CATEGORY = "special";
const COMPLETED_STATE = "pausedUP";
const SMALL_SYMLINK_THRESHOLD_MB = 75;
const DEFAULT_INTERVAL_S = 5;

export async function main() {
  const args = parseArgs({
    interval: { type: "number", default: DEFAULT_INTERVAL_S },
    once: { type: "boolean", default: false },
    category: { type: "string", default: SPECIAL_CATEGORY },
    destDir: { type: "string", default: "" },
  });

  banner("magnet-bridge");

  const cfg = getConfig();
  const client = new DecypharrClient(cfg.decypharrUrl);
  const destDir = args.destDir || join(cfg.mediaBasePath, SPECIAL_CATEGORY);

  info(`Decypharr: ${cfg.decypharrUrl}`);
  info(`Category:  ${args.category}`);
  info(`Dest dir:  ${destDir}`);
  info(`Interval:  ${args.interval}s${args.once ? " (single pass)" : ""}`);

  const shutdown = async (sig: string) => {
    info(`Received ${sig}, exiting.`);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const intervalMs = Math.max(1, args.interval) * 1000;

  if (args.once) {
    await pollOnce(client, args.category, destDir);
    return;
  }

  while (true) {
    try {
      await pollOnce(client, args.category, destDir);
    } catch (err) {
      warn(`Poll failed: ${(err as Error).message}`);
    }
    await sleep(intervalMs);
  }
}

/** One polling pass: list torrents, process each finished special one. */
export async function pollOnce(
  client: DecypharrClient,
  category: string,
  destDir: string,
): Promise<void> {
  let resp;
  try {
    resp = await client.listTorrents();
  } catch (err) {
    warn(`Error fetching torrents: ${(err as Error).message}`);
    return;
  }

  for (const t of resp.torrents) {
    if (t.category !== category) continue;
    if (t.state !== COMPLETED_STATE || !t.content_path) continue;

    let realPath: string;
    try {
      realPath = await resolvePath(t.content_path);
    } catch {
      warn(`Error locating content path for ${t.name} (${t.content_path})`);
      continue;
    }

    info(`Processing completed ${category} torrent: ${t.name} (${t.info_hash})`);

    try {
      await cleanupSmallSymlinks(realPath, SMALL_SYMLINK_THRESHOLD_MB);
    } catch (err) {
      warn(`Error cleaning up small symlinks in ${realPath}: ${(err as Error).message}`);
    }

    let moved = false;
    try {
      moved = await moveToLibrary(realPath, destDir);
    } catch (err) {
      warn(`Error moving ${realPath}: ${(err as Error).message}`);
    }

    // Whether we moved it or kept the existing larger copy, the torrent
    // has been handled — remove it from Decypharr either way.
    try {
      await client.deleteTorrent(category, t.info_hash);
      info(`Removed ${category} torrent from UI: ${t.info_hash}`);
    } catch (err) {
      warn(`Failed to remove torrent from UI: ${t.info_hash} (${(err as Error).message})`);
    }

    if (moved) info(`Handled ${t.name}`);
  }
}

/**
 * Move `src` into `destDir`. If a same-named target already exists,
 * keep whichever is larger (by total size, following symlinks); delete
 * the other. Returns true if `src` ended up as the destination (renamed
 * or replaced), false if the existing copy was kept.
 */
export async function moveToLibrary(src: string, destDir: string): Promise<boolean> {
  await mkdir(destDir, { recursive: true });
  const destPath = join(destDir, basename(src));

  let exists = false;
  try {
    await stat(destPath);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists) {
    const newSize = await getDirSize(src).catch((e) => {
      throw new Error(`size(new) ${src}: ${(e as Error).message}`);
    });
    const oldSize = await getDirSize(destPath).catch((e) => {
      throw new Error(`size(old) ${destPath}: ${(e as Error).message}`);
    });

    if (newSize > oldSize) {
      info(`New content is larger (${newSize} > ${oldSize}), replacing existing.`);
      await rm(destPath, { recursive: true, force: true });
    } else {
      info(`Existing content is larger or equal (${oldSize} >= ${newSize}), keeping existing.`);
      await rm(src, { recursive: true, force: true });
      return false;
    }
  }

  await rename(src, destPath);
  info(`Moved completed torrent to ${destPath}`);
  return true;
}

/**
 * Resolve a content path reported by Decypharr to a real on-disk path.
 *
 * Decypharr occasionally reports paths with a doubled `special/special`
 * segment, and sometimes the exact basename differs from what's on disk
 * (truncated / suffixed). We:
 *   1. Try the path verbatim.
 *   2. Fix a `/special/special` → `/special` duplication.
 *   3. Fall back to a prefix match against siblings of the parent dir.
 *
 * Throws if nothing resolves.
 */
export async function resolvePath(path: string): Promise<string> {
  // 1. verbatim
  try {
    await stat(path);
    return path;
  } catch {
    // fall through
  }

  // 2. doubled /special/special
  const parent = dirname(path);
  if (parent.endsWith("/special/special")) {
    const fixedParent = parent.replace(/\/special\/special$/, "/special");
    const fixedPath = join(fixedParent, basename(path));
    try {
      await stat(fixedPath);
      return fixedPath;
    } catch {
      // fall through
    }
  }

  // 3. prefix match against siblings
  const dir = dirname(path);
  const base = basename(path);
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`could not read parent dir ${dir}: ${(err as Error).message}`);
  }
  for (const entry of entries) {
    if (entry.name.startsWith(base)) {
      const candidate = join(dir, entry.name);
      try {
        await stat(candidate);
        return candidate;
      } catch {
        continue;
      }
    }
  }

  throw new Error(`path not found: ${path}`);
}

/**
 * Total size of a directory tree, following symlinks (matches Go's
 * filepath.Walk + os.Stat on symlink targets). Broken symlinks are
 * skipped.
 */
export async function getDirSize(path: string): Promise<number> {
  let size = 0;
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (err) {
    // Not a directory — measure as a file.
    const st = await stat(path).catch(() => null);
    return st && !st.isDirectory() ? st.size : 0;
  }
  for (const e of entries) {
    const full = join(path, e.name);
    if (e.isDirectory()) {
      size += await getDirSize(full);
    } else if (e.isSymbolicLink()) {
      const target = await stat(full).catch(() => null);
      if (target && !target.isDirectory()) size += target.size;
    } else if (e.isFile()) {
      size += (await lstat(full)).size;
    }
  }
  return size;
}

/**
 * Walk `dirPath` and delete any symlink whose target is a regular file
 * smaller than `minSizeMB`. Mirrors cleanupSmallSymlinks in the Go
 * magnet_bridge. Broken symlinks are left alone (broken-link-finder
 * handles those).
 */
export async function cleanupSmallSymlinks(dirPath: string, minSizeMB: number): Promise<void> {
  const minBytes = minSizeMB * 1024 * 1024;
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dirPath, e.name);
    if (e.isDirectory()) {
      await cleanupSmallSymlinks(full, minSizeMB);
    } else if (e.isSymbolicLink()) {
      const target = await stat(full).catch(() => null);
      if (!target || target.isDirectory()) continue;
      if (target.size < minBytes) {
        info(`Deleting small symlink: ${full} (target ${target.size} bytes)`);
        await rm(full, { force: true }).catch((err) => {
          warn(`Error deleting symlink ${full}: ${(err as Error).message}`);
        });
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

if (import.meta.main) {
  main().catch((err) => {
    warn(`magnet-bridge failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
