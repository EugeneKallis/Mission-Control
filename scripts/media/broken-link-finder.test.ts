/**
 * Tests for scripts/media/broken-link-finder.ts
 *
 * Pure helper tests (extOf, isMedia, MEDIA_EXTS) plus stat-based
 * symlink detection verification using temp directory fixtures.
 *
 * The walk / ffprobe path is I/O and requires ffprobe on PATH; the
 * run-loop is tested implicitly by the live server. Here we pin the
 * pure helpers and the core stat-vs-lstat distinction so a future
 * edit to the regex, media set, or detection strategy doesn't
 * silently change behavior.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { extOf, isMedia, MEDIA_EXTS } from "./broken-link-finder";

describe("MEDIA_EXTS", () => {
  test("contains the expected video container extensions", () => {
    for (const ext of [".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".ts", ".m2ts"]) {
      expect(MEDIA_EXTS.has(ext)).toBe(true);
    }
  });

  test("does not include non-video extensions", () => {
    for (const ext of [".txt", ".jpg", ".srt", ".nfo", ""]) {
      expect(MEDIA_EXTS.has(ext)).toBe(false);
    }
  });
});

describe("extOf", () => {
  test("returns the lowercased last extension", () => {
    expect(extOf("clip.mkv")).toBe(".mkv");
    expect(extOf("clip.MKV")).toBe(".mkv");
    expect(extOf("CLIP.Mp4")).toBe(".mp4");
  });

  test("returns an empty string for paths with no extension", () => {
    expect(extOf("README")).toBe("");
    expect(extOf("/path/to/Makefile")).toBe("");
  });

  test("returns the final extension for multi-dot filenames", () => {
    expect(extOf("release.2024.s01e02.mkv")).toBe(".mkv");
    expect(extOf("a.b.c.mp4")).toBe(".mp4");
  });

  test("matches dotfiles (the regex is greedy on the final segment)", () => {
    // Document the actual behavior: `/\.[^./]+$/` matches ".config"
    // in "/home/me/.config" because `.` is excluded from the negated
    // character class but the final segment after the last "/" still
    // starts with one. We only want to classify by extension, so this
    // is a known over-match — callers should pass a basename if they
    // need dotfile-precise behavior.
    expect(extOf("/home/me/.config")).toBe(".config");
  });

  test("handles trailing slashes and empty input", () => {
    expect(extOf("")).toBe("");
    expect(extOf("file/")).toBe("");
  });
});

describe("isMedia", () => {
  test("recognises common media extensions case-insensitively", () => {
    expect(isMedia("/mnt/debrid/__all__/X/Y.mkv")).toBe(true);
    expect(isMedia("Y.MKV")).toBe(true);
    expect(isMedia("Y.Mp4")).toBe(true);
    expect(isMedia("Y.WEBM")).toBe(true);
  });

  test("rejects non-media files", () => {
    expect(isMedia("readme.txt")).toBe(false);
    expect(isMedia("poster.jpg")).toBe(false);
    expect(isMedia("subtitles.srt")).toBe(false);
    expect(isMedia("Makefile")).toBe(false);
  });

  test("rejects files with no extension", () => {
    expect(isMedia("")).toBe(false);
    expect(isMedia("/path/to/symlink")).toBe(false);
  });
});

describe("symlink detection (stat vs lstat)", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* ok */ }
    }
    tmpDirs.length = 0;
  });

  function makeTempDir(): string {
    const d = mkdtempSync(join(tmpdir(), "bl-test-"));
    tmpDirs.push(d);
    return d;
  }

  test("stat throws ENOENT for dangling symlinks", async () => {
    const root = makeTempDir();
    symlinkSync("/nonexistent/target.mkv", join(root, "dangling.mkv"));

    const { stat } = await import("fs/promises");
    let threw = false;
    let code: string | undefined;
    try {
      await stat(join(root, "dangling.mkv"));
    } catch (e: any) {
      threw = true;
      code = e.code;
    }
    expect(threw).toBe(true);
    expect(code).toBe("ENOENT");
  });

  test("lstat succeeds for dangling symlinks (link entry exists)", async () => {
    const root = makeTempDir();
    symlinkSync("/nonexistent/target.mkv", join(root, "dangling.mkv"));

    const { lstat } = await import("fs/promises");
    const lst = await lstat(join(root, "dangling.mkv"));
    expect(lst.isSymbolicLink()).toBe(true);
  });

  test("stat follows valid relative symlink successfully", async () => {
    const root = makeTempDir();
    const targetDir = join(root, "targets");
    mkdirSync(targetDir, { recursive: true });
    const realTarget = join(targetDir, "movie.mkv");
    writeFileSync(realTarget, "not a real video but file exists");

    const linkDir = join(root, "links");
    mkdirSync(linkDir, { recursive: true });
    const sym = join(linkDir, "movie.mkv");
    symlinkSync("../targets/movie.mkv", sym);

    const { stat } = await import("fs/promises");
    const st = await stat(sym);
    expect(st.isFile()).toBe(true);
  });

  test("isMedia correctly classifies symlink path extensions", async () => {
    // The isMedia helper checks the path string's extension directly.
    // These are plain string tests — no filesystem needed.
    expect(isMedia("/some/link/to/video.mkv")).toBe(true);
    expect(isMedia("/some/link/to/subtitles.srt")).toBe(false);
    expect(isMedia("/some/link")).toBe(false);
  });
});
