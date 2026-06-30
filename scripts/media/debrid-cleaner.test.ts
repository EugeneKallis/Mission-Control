/**
 * Tests for scripts/media/debrid-cleaner.ts
 *
 * The script's I/O surface (readdir, lstat, readlink, rm) is the
 * boring part — those are exercised by the live cleanup run on the
 * server. The interesting decisions are:
 *   1. How to extract the rclone folder name from a symlink target
 *      (it's the segment immediately before the final path component).
 *   2. How to filter readdir noise + path-traversal payloads.
 *   3. How to compute the orphan set (pure set difference).
 *
 * Pin those, and a future edit to the path shape or the filter rules
 * will fail loudly.
 */

import { describe, expect, test } from "bun:test";
import {
  computeOrphans,
  rcloneFolderName,
  safeDebridFolders,
} from "./debrid-cleaner";

describe("rcloneFolderName", () => {
  test("extracts the second-to-last segment of a normal rclone path", () => {
    // Layout: __all__/<FolderName>/<file>
    expect(rcloneFolderName("/mnt/debrid/__all__/FolderA/file.mkv")).toBe("FolderA");
    expect(rcloneFolderName("__all__/FolderB/clip.mp4")).toBe("FolderB");
  });

  test("handles a relative path with no leading slash", () => {
    expect(rcloneFolderName("__all__/FolderB/clip.mkv")).toBe("FolderB");
  });

  test("ignores empty segments from repeated slashes", () => {
    expect(rcloneFolderName("__all__//FolderC//file.mkv")).toBe("FolderC");
  });

  test("returns undefined for paths with fewer than two segments", () => {
    expect(rcloneFolderName("")).toBeUndefined();
    expect(rcloneFolderName("/")).toBeUndefined();
    expect(rcloneFolderName("just-one-segment")).toBeUndefined();
    expect(rcloneFolderName("__all__/")).toBeUndefined();
  });

  test("handles deeply nested paths (still returns second-to-last)", () => {
    // The cleanup logic only cares about the rclone folder, not the
    // inner file layout. rcloneFolderName returns the segment
    // immediately before the final filename.
    expect(rcloneFolderName("/a/b/c/d/e.mkv")).toBe("d");
  });
});

describe("safeDebridFolders", () => {
  test("keeps ordinary folder names", () => {
    expect(safeDebridFolders(["A", "B", "C"])).toEqual(["A", "B", "C"]);
  });

  test("drops the . and .. sentinels", () => {
    expect(safeDebridFolders([".", "..", "A"])).toEqual(["A"]);
  });

  test("drops empty strings", () => {
    expect(safeDebridFolders(["", "A", ""])).toEqual(["A"]);
  });

  test("drops any folder name containing a slash (path traversal)", () => {
    expect(safeDebridFolders(["good", "../escape", "a/b", "ok"])).toEqual([
      "good",
      "ok",
    ]);
  });

  test("returns an empty array for an empty input", () => {
    expect(safeDebridFolders([])).toEqual([]);
  });

  test("returns an empty array when every entry is invalid", () => {
    expect(safeDebridFolders([".", "..", "", "a/b"])).toEqual([]);
  });
});

describe("computeOrphans", () => {
  test("returns the input when nothing is referenced", () => {
    expect(computeOrphans(["A", "B", "C"], new Set())).toEqual(["A", "B", "C"]);
  });

  test("returns an empty array when everything is referenced", () => {
    expect(computeOrphans(["A", "B"], new Set(["A", "B", "C"]))).toEqual([]);
  });

  test("returns only the unreferenced entries, preserving order", () => {
    expect(computeOrphans(["A", "B", "C", "D"], new Set(["B", "D"]))).toEqual([
      "A",
      "C",
    ]);
  });

  test("accepts any iterable for the referenced set (not just Set)", () => {
    const ref = ["A", "C"];
    expect(computeOrphans(["A", "B", "C"], ref)).toEqual(["B"]);
  });

  test("handles an empty debrid folder list", () => {
    expect(computeOrphans([], new Set(["A"]))).toEqual([]);
  });
});
