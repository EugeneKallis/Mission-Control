/**
 * Tests for scripts/media/broken-link-finder.ts
 *
 * The script's only pure logic is file-classification: the extension
 * extractor and the media-extension set. The walk / ffprobe path is
 * I/O and tested implicitly by the run-loop (ffprobe on the live
 * server). We only need to pin the pure helpers so a future edit to
 * the regex or the media set doesn't silently change behavior.
 */

import { describe, expect, test } from "bun:test";
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
