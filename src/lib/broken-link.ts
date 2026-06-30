/**
 * Broken-link / readability probe helpers.
 *
 * Shared between the long-running worker (`src/workers/broken-link-checker.ts`)
 * and any tests / scripts that need to detect "this media file can't be
 * played." Backed by `ffprobe`.
 *
 * Why this is a separate probe from the old `ffprobeOk` in
 * `scripts/media/broken-link-finder.ts`:
 *
 *   The old check used `ffprobe -show_entries format=duration`, which only
 *   reads the *container header*. A file whose header is intact but whose
 *   stream body is corrupt / truncated passes that check — and is exactly
 *   the "shows in Plex but won't play" failure mode the new system is
 *   trying to catch. The new probe uses `-read_intervals %+5
 *   -show_packets -select_streams v:0` to actually read packets from the
 *   first 5 seconds of the video stream, so a corrupt body (or an
 *   unreachable webdav target that returns headers but not bytes) will
 *   fail the probe.
 */

import { lstat, readdir, readlink, stat } from "fs/promises";
import { join, sep } from "path";
import { getConfig } from "@/lib/config";
import { pMap } from "@/lib/p-map";

// ── Constants ─────────────────────────────────────────────────────────────

/** File extensions the broken-link checker treats as media. */
export const MEDIA_EXTS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".ts",
  ".m2ts",
]);

/** Default per-file probe timeout in seconds. */
export const DEFAULT_PROBE_TIMEOUT_S = 30;

/** Default number of packets to require for a probe to count as "ok". */
export const MIN_PACKETS_FOR_OK = 1;

// ── Pure helpers ──────────────────────────────────────────────────────────

/** Lowercase extension of `p`, or "" if none. Matches the Go helper. */
export function extOf(p: string): string {
  const m = p.match(/\.[^./]+$/);
  return m ? m[0].toLowerCase() : "";
}

/** True if `target` looks like a media file based on its extension. */
export function isMedia(target: string): boolean {
  return MEDIA_EXTS.has(extOf(target));
}

/** Convert platform-native separators to POSIX slashes for storage. */
export function toPosix(p: string): string {
  return p.split(sep).join("/");
}

// ── Probe ─────────────────────────────────────────────────────────────────

export interface ProbeResult {
  ok: boolean;
  packets: number;
  error?: string;
  elapsedMs: number;
}

/**
 * Run ffprobe against `targetPath` and report whether the start of the
 * video stream can actually be read. Returns `{ok, packets, error?, elapsedMs}`.
 *
 * - `ok=true` iff ffprobe exited 0 AND emitted ≥1 packet line within
 *   `timeoutSec`. We treat a "no packets" return as a soft failure: a
 *   file with a valid container but zero readable packets is exactly
 *   the unplayable-file case the user is trying to detect.
 * - On timeout the spawned process is killed.
 * - All thrown errors are caught and returned as `{ok:false, error}` so
 *   callers can log them without try/catching.
 */
export async function probeFileReadable(
  targetPath: string,
  timeoutSec: number = DEFAULT_PROBE_TIMEOUT_S,
): Promise<ProbeResult> {
  const started = Date.now();
  let proc: ReturnType<typeof Bun.spawn> | null = null;
  try {
    proc = Bun.spawn({
      cmd: [
        "ffprobe",
        "-v", "error",
        "-read_intervals", "%+5",
        "-show_packets",
        "-select_streams", "v:0",
        "-of", "csv=p=0",
        targetPath,
      ],
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (err) {
    return { ok: false, packets: 0, error: `spawn failed: ${(err as Error).message}`, elapsedMs: Date.now() - started };
  }

  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), timeoutSec * 1000),
  );
  const exited = await Promise.race([proc.exited, timeout]);
  if (exited === "timeout") {
    try { proc.kill(); } catch { /* ignore */ }
    return { ok: false, packets: 0, error: `timeout after ${timeoutSec}s`, elapsedMs: Date.now() - started };
  }

  const text = await new Response(proc.stdout as ReadableStream<Uint8Array>).text();
  const stderr = await new Response(proc.stderr as ReadableStream<Uint8Array>).text();
  const elapsedMs = Date.now() - started;

  if (exited !== 0) {
    return { ok: false, packets: 0, error: stderr.trim() || `ffprobe exited ${exited}`, elapsedMs };
  }

  // Count non-empty csv lines. The csv=p=0 format emits one line per packet.
  const packets = text.split("\n").filter((l) => l.trim().length > 0).length;
  if (packets < MIN_PACKETS_FOR_OK) {
    return { ok: false, packets, error: "no packets emitted in first 5s", elapsedMs };
  }
  return { ok: true, packets, elapsedMs };
}

// ── Discovery ─────────────────────────────────────────────────────────────

export interface FileCheckSeed {
  filePath: string;        // absolute POSIX path (e.g. /mnt/debrid/media/movies/...)
  mediaDir: string;        // top-level media dir name (movies, tv, special, ...)
  symlinkTarget: string;   // absolute path the symlink points to
  fileSize: number | null; // target size if available
}

/**
 * Walk every configured media dir under MEDIA_BASE_PATH and yield one
 * `FileCheckSeed` per media-file symlink. The walk is done with bounded
 * concurrency so a 10k-entry tree doesn't fork thousands of readdirs.
 *
 * Excludes the symlink itself when its target isn't a media extension
 * (regular files, non-media symlinks, directories). Broken symlinks
 * (where `readlink` succeeds but `stat` fails) are still returned as
 * seeds with `fileSize=null` — the probe will report them as broken
 * and the user can decide what to do.
 */
export async function discoverFiles(opts?: {
  basePath?: string;
  mediaDirs?: string[];
  concurrency?: number;
  delayMs?: number;
}): Promise<FileCheckSeed[]> {
  const cfg = getConfig();
  const basePath = (opts?.basePath ?? cfg.mediaBasePath).replace(/\/+$/, "");
  const mediaDirs = opts?.mediaDirs ?? cfg.mediaDirectories;
  const concurrency = opts?.concurrency ?? 16;
  const delayMs = opts?.delayMs ?? 0;

  const seeds: FileCheckSeed[] = [];
  for (const dir of mediaDirs) {
    const root = join(basePath, dir);
    try {
      await stat(root);
    } catch {
      // Directory doesn't exist (common on dev machines) — skip.
      continue;
    }
    await walkForMedia(root, dir, seeds, concurrency, delayMs);
  }
  return seeds;
}

async function walkForMedia(
  absDir: string,
  mediaDir: string,
  out: FileCheckSeed[],
  concurrency: number,
  delayMs: number,
): Promise<void> {
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  // Parallelise over the immediate children of this directory; each child
  // recurses serially. This is shallow enough to keep memory pressure low
  // while still parallelising the readdir calls.
  await pMap(entries, async (e) => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const full = join(absDir, e.name);
    if (e.isSymbolicLink()) {
      let target: string;
      try {
        target = await readlink(full);
      } catch {
        return; // Can't even read the symlink; skip.
      }
      if (!isMedia(target)) return; // Not media; we only care about media symlinks.

      let size: number | null = null;
      try {
        const st = await stat(target);
        if (st.isFile()) size = st.size;
      } catch {
        // Broken symlink — size is unknown, but we still want to record
        // the row so the probe can confirm it's broken.
        size = null;
      }
      out.push({
        filePath: toPosix(full),
        mediaDir,
        symlinkTarget: target,
        fileSize: size,
      });
    } else if (e.isDirectory()) {
      await walkForMedia(full, mediaDir, out, concurrency, delayMs);
    }
  }, concurrency);
}

/**
 * Confirm `path` is a symlink (by lstat) and that its target is missing
 * or unreadable. Used by the delete route as a final safety check before
 * `rm`-ing the symlink.
 */
export async function isBrokenSymlink(path: string): Promise<boolean> {
  try {
    const st = await lstat(path);
    if (!st.isSymbolicLink()) return false;
    await stat(path); // Follow — throws if target is missing.
    return false;
  } catch {
    return true;
  }
}
