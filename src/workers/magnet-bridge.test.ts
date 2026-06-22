/**
 * Unit tests for the pure filesystem helpers in src/workers/magnet-bridge.ts.
 *
 * Covered:
 *  - resolvePath: verbatim, doubled /special/special fix, prefix-match fallback, not-found
 *  - getDirSize: regular files, nested dirs, symlinks followed, broken symlinks skipped
 *  - cleanupSmallSymlinks: deletes small-target symlinks, keeps large ones, recurses
 *  - moveToLibrary: simple move, replace larger, keep larger existing
 *
 * Not covered: the polling loop + Decypharr client (needs real HTTP).
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile, rm, stat, readdir, rename } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  resolvePath,
  getDirSize,
  cleanupSmallSymlinks,
  moveToLibrary,
} from "./magnet-bridge";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "magnet-bridge-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true }).catch(() => {});
});

async function write(path: string, bytes: number): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, Buffer.alloc(bytes, 0));
}

describe("resolvePath", () => {
  test("returns the verbatim path when it exists", async () => {
    const p = join(root, "real");
    await write(p, 10);
    expect(await resolvePath(p)).toBe(p);
  });

  test("fixes a doubled /special/special parent", async () => {
    // Real layout: <root>/special/A — Decypharr reports <root>/special/special/A
    const real = join(root, "special", "A");
    await write(real, 10);
    const reported = join(root, "special", "special", "A");
    expect(await resolvePath(reported)).toBe(real);
  });

  test("falls back to a prefix match against siblings", async () => {
    // On disk the file has a suffix; Decypharr reports the truncated base.
    const real = join(root, "dir", "Release.Name-GROUP");
    await write(real, 10);
    const reported = join(root, "dir", "Release.Name");
    expect(await resolvePath(reported)).toBe(real);
  });

  test("throws when nothing resolves", async () => {
    await expect(resolvePath(join(root, "missing"))).rejects.toThrow(/not found/);
  });
});

describe("getDirSize", () => {
  test("sums regular files across nested dirs", async () => {
    await write(join(root, "a.bin"), 100);
    await write(join(root, "sub", "b.bin"), 200);
    expect(await getDirSize(root)).toBe(300);
  });

  test("follows symlinks and counts target size", async () => {
    const target = join(root, "target.bin");
    await write(target, 500);
    await symlink(target, join(root, "link.bin"));
    expect(await getDirSize(root)).toBe(1000); // target + symlink-to-target
  });

  test("skips broken symlinks", async () => {
    await write(join(root, "real.bin"), 50);
    await symlink("/nonexistent/target", join(root, "broken.bin"));
    expect(await getDirSize(root)).toBe(50);
  });

  test("returns file size when called on a file", async () => {
    const f = join(root, "single.bin");
    await write(f, 123);
    expect(await getDirSize(f)).toBe(123);
  });
});

describe("cleanupSmallSymlinks", () => {
  test("deletes symlinks whose target is below the threshold", async () => {
    const small = join(root, "small.bin");
    const big = join(root, "big.bin");
    await write(small, 1); // 1 byte
    await write(big, 76 * 1024 * 1024); // 76 MB → above 75 MB
    await symlink(small, join(root, "small.lnk"));
    await symlink(big, join(root, "big.lnk"));

    await cleanupSmallSymlinks(root, 75);

    const remaining = await readdir(root);
    expect(remaining).toContain("big.lnk");
    expect(remaining).toContain("big.bin");
    expect(remaining).toContain("small.bin"); // target untouched
    expect(remaining).not.toContain("small.lnk");
  });

  test("recurses into subdirectories", async () => {
    const small = join(root, "sub", "small.bin");
    await write(small, 1);
    await symlink(small, join(root, "sub", "small.lnk"));

    await cleanupSmallSymlinks(root, 75);

    const sub = await readdir(join(root, "sub"));
    expect(sub).toContain("small.bin");
    expect(sub).not.toContain("small.lnk");
  });

  test("leaves broken symlinks alone", async () => {
    const broken = join(root, "broken.lnk");
    await symlink("/nonexistent", broken);
    await cleanupSmallSymlinks(root, 75);
    const remaining = await readdir(root);
    expect(remaining).toContain("broken.lnk");
  });
});

describe("moveToLibrary", () => {
  test("moves content into the dest dir when no conflict", async () => {
    const src = join(root, "src", "Release");
    await write(join(src, "file.bin"), 100);
    const dest = join(root, "dest");
    const moved = await moveToLibrary(src, dest);
    expect(moved).toBe(true);
    const destItem = join(dest, "Release");
    expect(await stat(join(destItem, "file.bin"))).toBeDefined();
    // src is gone
    await expect(stat(src)).rejects.toThrow();
  });

  test("replaces existing dest when new content is larger", async () => {
    const src = join(root, "src", "Item");
    await write(join(src, "big.bin"), 500);
    const dest = join(root, "dest");
    const existing = join(dest, "Item");
    await write(join(existing, "small.bin"), 10);

    const moved = await moveToLibrary(src, dest);
    expect(moved).toBe(true);
    expect(await stat(join(dest, "Item", "big.bin"))).toBeDefined();
    await expect(stat(join(dest, "Item", "small.bin"))).rejects.toThrow();
  });

  test("keeps existing dest and deletes src when existing is larger", async () => {
    const src = join(root, "src", "Item");
    await write(join(src, "small.bin"), 10);
    const dest = join(root, "dest");
    const existing = join(dest, "Item");
    await write(join(existing, "big.bin"), 500);

    const moved = await moveToLibrary(src, dest);
    expect(moved).toBe(false);
    expect(await stat(join(dest, "Item", "big.bin"))).toBeDefined();
    await expect(stat(src)).rejects.toThrow(); // src removed
  });
});
