/**
 * Unit tests for the pure helpers in src/workers/file-scanner.ts.
 *
 * The file scanner walks a media directory and upserts symlink entries
 * into the nzb_files / debrid_files tables. The walking + DB upsert
 * paths are integration territory (we test them by running the worker
 * in a controlled dev environment). The pure helpers are tested here.
 *
 * Helpers tested:
 *  - classifyTarget: NZB/DEBRID prefix detection
 *  - toPosix:        forward-slash normalisation
 *  - parentOf:       Go's filepath.Dir equivalent
 *  - emptyToEmpty:   Go's "." -> "" empty-parent conversion
 *  - pMap:           bounded-concurrency parallel map
 *  - computeFileCounts: recursive file count per directory
 */

import { describe, test, expect } from "bun:test";
import {
  classifyTarget,
  toPosix,
  parentOf,
  emptyToEmpty,
  computeFileCounts,
} from "./file-scanner";
import { pMap } from "@/lib/p-map";

describe("classifyTarget", () => {
  test("classifies an NZB target", () => {
    expect(classifyTarget("/mnt/addons/nzbdav/foo/bar")).toBe("nzb");
  });

  test("classifies a debrid target", () => {
    expect(classifyTarget("/mnt/addons/debrid/foo/bar")).toBe("debrid");
  });

  test("returns null for an unrelated target", () => {
    expect(classifyTarget("/etc/passwd")).toBeNull();
    expect(classifyTarget("")).toBeNull();
  });

  test("requires a prefix match (not just 'addons/nzb')", () => {
    expect(classifyTarget("/mnt/foo/addons/nzbdav")).toBeNull();
  });
});

describe("toPosix", () => {
  // toPosix is platform-aware: it replaces the OS-native separator with "/".
  // On Linux/macOS the native sep is "/", so the function is effectively a
  // no-op (we just assert the contract). On Windows it would convert "\".
  test("returns the input unchanged when it's already POSIX", () => {
    expect(toPosix("a/b/c")).toBe("a/b/c");
  });

  test("returns empty string for empty input", () => {
    expect(toPosix("")).toBe("");
  });

  test("returns a POSIX-formatted string for single-segment input", () => {
    expect(toPosix("foo")).toBe("foo");
  });
});

describe("parentOf", () => {
  test("strips the last segment of a multi-segment path", () => {
    expect(parentOf("a/b/c")).toBe("a/b");
  });

  test("returns '/' for a top-level path with a leading slash", () => {
    expect(parentOf("/a")).toBe("/");
  });

  test("returns '.' for a single-segment path without a slash", () => {
    expect(parentOf("foo")).toBe(".");
  });

  test("returns '.' for an empty string", () => {
    expect(parentOf("")).toBe(".");
  });
});

describe("emptyToEmpty", () => {
  test("converts '.' to ''", () => {
    expect(emptyToEmpty(".")).toBe("");
  });

  test("leaves other strings alone", () => {
    expect(emptyToEmpty("foo")).toBe("foo");
    expect(emptyToEmpty("a/b")).toBe("a/b");
    expect(emptyToEmpty("")).toBe("");
  });
});

describe("pMap", () => {
  test("preserves order regardless of completion order", async () => {
    const items = [1, 2, 3, 4, 5];
    const result = await pMap(
      items,
      async (n) => {
        // Vary delay to encourage out-of-order completion
        await new Promise((r) => setTimeout(r, 10 - n));
        return n * 10;
      },
      3,
    );
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  test("respects the concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await pMap(
      items,
      async (n) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return n;
      },
      4,
    );
    expect(maxInFlight).toBeLessThanOrEqual(4);
  });

  test("with concurrency >= items.length, all run at once", async () => {
    const items = [1, 2, 3];
    let maxInFlight = 0;
    let inFlight = 0;
    await pMap(
      items,
      async (n) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return n;
      },
      10,
    );
    expect(maxInFlight).toBe(3);
  });

  test("with an empty array, returns [] immediately", async () => {
    expect(await pMap([], async (n: number) => n, 4)).toEqual([]);
  });
});

describe("computeFileCounts", () => {
  test("returns 0 for every directory with no file descendants", () => {
    const counts = computeFileCounts([
      { path: "movies", name: "movies", parentPath: "", isDir: true, linkTarget: null, source: "nzb" },
    ]);
    expect(counts.get("movies")).toBe(0);
  });

  test("counts direct files of a directory", () => {
    const counts = computeFileCounts([
      { path: "movies", name: "movies", parentPath: "", isDir: true, linkTarget: null, source: "nzb" },
      { path: "movies/A", name: "A", parentPath: "movies", isDir: false, linkTarget: "/x", source: "nzb" },
      { path: "movies/B", name: "B", parentPath: "movies", isDir: false, linkTarget: "/y", source: "nzb" },
    ]);
    expect(counts.get("movies")).toBe(2);
  });

  test("recursively counts files in nested directories", () => {
    const counts = computeFileCounts([
      { path: "movies", name: "movies", parentPath: "", isDir: true, linkTarget: null, source: "nzb" },
      { path: "movies/Action", name: "Action", parentPath: "movies", isDir: true, linkTarget: null, source: "nzb" },
      { path: "movies/Action/A", name: "A", parentPath: "movies/Action", isDir: false, linkTarget: "/x", source: "nzb" },
      { path: "movies/Comedy", name: "Comedy", parentPath: "movies", isDir: true, linkTarget: null, source: "nzb" },
      { path: "movies/Comedy/X", name: "X", parentPath: "movies/Comedy", isDir: false, linkTarget: "/x", source: "nzb" },
      { path: "movies/Comedy/Y", name: "Y", parentPath: "movies/Comedy", isDir: false, linkTarget: "/y", source: "nzb" },
    ]);
    expect(counts.get("movies")).toBe(3);
    expect(counts.get("movies/Action")).toBe(1);
    expect(counts.get("movies/Comedy")).toBe(2);
  });

  test("does not include nested directory entries themselves in the count", () => {
    const counts = computeFileCounts([
      { path: "movies", name: "movies", parentPath: "", isDir: true, linkTarget: null, source: "nzb" },
      { path: "movies/Action", name: "Action", parentPath: "movies", isDir: true, linkTarget: null, source: "nzb" },
      { path: "movies/Action/Heat", name: "Heat", parentPath: "movies/Action", isDir: false, linkTarget: "/x", source: "nzb" },
    ]);
    // Action counts its single file (Heat); movies counts Heat (via Action).
    expect(counts.get("movies/Action")).toBe(1);
    expect(counts.get("movies")).toBe(1);
  });
});
