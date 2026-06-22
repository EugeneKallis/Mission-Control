#!/usr/bin/env bun
/**
 * torrent-watch — watches a directory for new `.torrent` and `.magnet`
 * files, submits each to Decypharr, and deletes the file after success.
 *
 * Usage:
 *   just run-worker src/workers/torrent-watch.ts
 *   just run-worker src/workers/torrent-watch.ts -- --watch-dir /watch
 *
 * Env (consumed by AppConfig):
 *   DECYPHARR_URL  (default http://192.168.1.99:8282)
 *   DOWNLOAD_FOLDER (default /mnt/debrid/downloads)
 *
 * Override the Arr name in the form-data via `DECYPHARR_ARR` env var
 * directly — AppConfig does not model this yet.
 *
 * The worker runs forever; stop with SIGINT/SIGTERM.
 */

import { readdir, readFile, stat, unlink, watch } from "fs/promises";
import { basename, extname, join } from "path";
import { DecypharrClient } from "@/lib/clients/decypharr";
import { getConfig } from "@/lib/config";
import { parseArgs } from "../../scripts/_lib/cli";
import { info, warn } from "../../scripts/_lib/log";

const TORRENT_EXTS = new Set([".torrent"]);
const POLL_INTERVAL_MS = 2_000;
const RETRY_DELAY_MS = 5_000;
const SIZE_STABILITY_DELAY_MS = 250;
const DECYPHARR_ARR_DEFAULT = "special";

async function main() {
  const args = parseArgs({
    watchDir: { type: "string", default: "/watch" },
  });

  const cfg = getConfig();
  const client = new DecypharrClient(
    cfg.decypharrUrl,
    process.env.DECYPHARR_ARR || DECYPHARR_ARR_DEFAULT,
    process.env.DOWNLOAD_FOLDER || "/mnt/debrid/downloads",
  );

  info(`torrent-watch started — watching ${args.watchDir}`);

  // Graceful shutdown.
  const shutdown = async (sig: string) => {
    info(`Received ${sig}, exiting.`);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Initial sweep (catch up on any files dropped while the worker was down).
  await sweep(args.watchDir, client);

  // Watch loop. fs.watch can be unreliable on some filesystems, so we also
  // poll every 2 s as a backstop.
  const watcher = watch(args.watchDir, { recursive: false });
  const poller = setInterval(() => sweep(args.watchDir, client).catch(() => {}), POLL_INTERVAL_MS);

  try {
    for await (const event of watcher) {
      if (event.eventType === "change" || event.eventType === "rename") {
        await sweep(args.watchDir, client);
      }
    }
  } finally {
    clearInterval(poller);
  }
}

async function sweep(dir: string, client: DecypharrClient) {
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    const full = join(dir, e.name);
    if (TORRENT_EXTS.has(ext)) {
      await submitTorrent(full, client);
    } else if (e.name.endsWith(".magnet")) {
      await submitMagnet(full, client);
    }
  }
}

async function submitTorrent(path: string, client: DecypharrClient) {
  try {
    // Wait until the file size is stable (dropper may still be writing).
    if (!(await sizeStable(path))) return;

    const data = await readFile(path);
    // Bun's readFile returns a Buffer; Decypharr's addTorrent wants an ArrayBuffer view.
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    await retry(() => client.addTorrent(ab, basename(path)));
    await unlink(path);
    info(`submitted torrent: ${basename(path)}`);
  } catch (err) {
    warn(`Failed ${path}: ${(err as Error).message}`);
  }
}

async function submitMagnet(path: string, client: DecypharrClient) {
  try {
    // Same size-stability check as submitTorrent — magnet files are tiny
    // and can also be written incrementally by the dropper.
    if (!(await sizeStable(path))) return;

    const text = (await readFile(path, "utf8")).trim();
    if (!text.startsWith("magnet:")) {
      warn(`Skipping non-magnet file: ${path}`);
      return;
    }
    await retry(() => client.addMagnet(text));
    await unlink(path);
    info(`submitted magnet: ${basename(path)}`);
  } catch (err) {
    warn(`Failed ${path}: ${(err as Error).message}`);
  }
}

/** Returns true when the file size is the same across two reads. */
async function sizeStable(path: string): Promise<boolean> {
  const size1 = (await stat(path)).size;
  await sleep(SIZE_STABILITY_DELAY_MS);
  const size2 = (await stat(path)).size;
  return size1 === size2;
}

async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

if (import.meta.main) {
  main().catch((err) => {
    warn(`torrent-watch failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
