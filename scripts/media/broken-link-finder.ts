#!/usr/bin/env bun
/**
 * Broken-link finder — find broken symlinks and corrupt media in the
 * configured "special" media paths.
 *
 * Walks the special dir, and for each symlink:
 *   - if the target is missing or unreadable → broken link
 *   - if the target is a media file but ffprobe can't read it within
 *     30 s → corrupt
 *
 * Writes a markdown report (default: ./broken-links-<ts>.md). With
 * `--rm` it also removes the broken symlink (never the target).
 *
 * Usage:
 *   just script scripts/media/broken-link-finder.ts              # report only
 *   just script scripts/media/broken-link-finder.ts -- --rm      # also remove
 *   just script scripts/media/broken-link-finder.ts -- --timeout 60
 *
 * Requires `ffprobe` on PATH.
 */

import { lstat, readdir, readlink, rm, writeFile } from "fs/promises";
import { join } from "path";
import { getConfig } from "@/lib/config";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, summary, warn } from "../_lib/log";

export const MEDIA_EXTS = new Set([".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".ts", ".m2ts"]);

async function main() {
  const args = parseArgs({
    rm: { type: "boolean", default: false },
    timeout: { type: "number", default: 30 },
    output: { type: "string", default: "" },
  });
  banner("Broken-link finder", { dryRun: !args.rm });

  const cfg = getConfig();
  const root = join(cfg.mediaBasePath, "special");
  info(`Scanning: ${root}`);

  const broken: { path: string; reason: string }[] = [];
  const corrupt: { path: string; reason: string }[] = [];
  try {
    await walk(root, broken, corrupt, args.timeout);
  } catch (err) {
    error(`Walk failed: ${(err as Error).message}`);
    process.exit(1);
  }

  info(`Broken links: ${broken.length}`);
  info(`Corrupt media: ${corrupt.length}`);

  // Write report.
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = args.output || `./broken-links-${ts}.md`;
  const lines: string[] = [];
  lines.push(`# Broken-link report (${new Date().toISOString()})`);
  lines.push("");
  lines.push(`## Broken symlinks (${broken.length})`);
  for (const b of broken) lines.push(`- \`${b.path}\` — ${b.reason}`);
  lines.push("");
  lines.push(`## Corrupt media (${corrupt.length})`);
  for (const c of corrupt) lines.push(`- \`${c.path}\` — ${c.reason}`);
  await writeFile(reportPath, lines.join("\n"), "utf8");
  info(`Report written to ${reportPath}`);

  if (args.rm) {
    for (const b of broken) {
      try {
        await rm(b.path, { force: true });
      } catch (err) {
        warn(`Failed to remove ${b.path}: ${(err as Error).message}`);
      }
    }
    info(`Removed ${broken.length} broken symlink(s)`);
  }

  summary({
    "Broken links:": broken.length,
    "Corrupt media:": corrupt.length,
    "Report:": reportPath,
    "Mode:": args.rm ? "LIVE" : "REPORT ONLY",
  });
}

async function walk(
  dir: string,
  broken: { path: string; reason: string }[],
  corrupt: { path: string; reason: string }[],
  timeoutSec: number,
) {
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isSymbolicLink()) {
      try {
        await lstat(full);
        // lstat succeeded — link resolves. Now check the target.
        const target = await readlink(full);
        if (await isMedia(target)) {
          const ok = await ffprobeOk(target, timeoutSec);
          if (!ok) corrupt.push({ path: full, reason: `ffprobe failed on ${target}` });
        }
      } catch {
        broken.push({ path: full, reason: "target missing or unreadable" });
      }
    } else if (e.isDirectory()) {
      await walk(full, broken, corrupt, timeoutSec);
    }
  }
}

export function extOf(p: string): string {
  const m = p.match(/\.[^./]+$/);
  return m ? m[0].toLowerCase() : "";
}

export function isMedia(target: string): boolean {
  return MEDIA_EXTS.has(extOf(target));
}

async function ffprobeOk(target: string, timeoutSec: number): Promise<boolean> {
  const proc = Bun.spawn({
    cmd: ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", target],
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), timeoutSec * 1000),
  );
  const result = await Promise.race([proc.exited, timeout]);
  if (result === "timeout") {
    try { proc.kill(); } catch { /* ignore */ }
    return false;
  }
  if (result !== 0) return false;
  const text = await new Response(proc.stdout).text();
  return text.trim().length > 0;
}

if (import.meta.main) {
  main().catch((err) => {
    error("broken-link-finder failed", err);
    process.exit(1);
  });
}
