/**
 * Unit tests for src/lib/broken-link.ts.
 *
 * - `extOf` / `isMedia`: pure, no I/O.
 * - `probeFileReadable`: mocked `Bun.spawn`; covers the four exit paths
 *   (ok with packets, no packets, non-zero exit, timeout).
 * - `discoverFiles`: builds a real temp tree of symlinks, asserts the
 *   seed list matches.
 * - `isBrokenSymlink`: builds a temp symlink and toggles its target.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { extOf, isMedia, type FileCheckSeed } from "./broken-link";

// ── Pure helpers ─────────────────────────────────────────────────────────

describe("extOf", () => {
  test("returns the lowercase extension", () => {
    expect(extOf("foo.MKV")).toBe(".mkv");
    expect(extOf("bar/baz.mp4")).toBe(".mp4");
  });
  test("returns '' for paths without an extension", () => {
    expect(extOf("README")).toBe("");
    expect(extOf("a/b/c")).toBe("");
  });
  test("ignores trailing dots", () => {
    expect(extOf("foo.")).toBe("");
  });
});

describe("isMedia", () => {
  test("matches known media extensions", () => {
    expect(isMedia("x.mkv")).toBe(true);
    expect(isMedia("x.MP4")).toBe(true);
    expect(isMedia("x.webm")).toBe(true);
  });
  test("rejects non-media extensions", () => {
    expect(isMedia("x.jpg")).toBe(false);
    expect(isMedia("x.txt")).toBe(false);
    expect(isMedia("noext")).toBe(false);
  });
});

// ── discoverFiles / isBrokenSymlink (real temp tree) ─────────────────────

describe("discoverFiles (real temp tree)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "blf-discover-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("yields one seed per media symlink, none for non-media or files", async () => {
    const movies = join(root, "movies");
    const specials = join(root, "special");
    await mkdir(movies, { recursive: true });
    await mkdir(specials, { recursive: true });

    // Create real target files.
    const targetA = join(root, "_targetA.mkv");
    const targetB = join(root, "_targetB.mp4");
    const targetC = join(root, "_targetC.jpg"); // non-media target
    await writeFile(targetA, "");
    await writeFile(targetB, "");
    await writeFile(targetC, "");

    // Media symlinks (should be picked up).
    await symlink(targetA, join(movies, "alpha.mkv"));
    await symlink(targetB, join(specials, "beta.mp4"));
    // Non-media symlink (should be skipped).
    await symlink(targetC, join(movies, "cover.jpg"));

    const { discoverFiles } = await import("./broken-link?bust=" + Date.now());
    // The module caches getConfig at import time; pass mediaDirs explicitly
    // to avoid that lookup depending on the real env.
    const seeds = await discoverFiles({
      basePath: root,
      mediaDirs: ["movies", "special"],
      concurrency: 4,
    });

    const paths = seeds.map((s: FileCheckSeed) => s.filePath).sort();
    expect(paths).toContain(join(root, "movies/alpha.mkv"));
    expect(paths).toContain(join(root, "special/beta.mp4"));
    expect(paths).not.toContain(join(root, "movies/cover.jpg"));

    // mediaDir classification is correct.
    const alpha = seeds.find((s: FileCheckSeed) => s.filePath.endsWith("alpha.mkv"))!;
    expect(alpha.mediaDir).toBe("movies");
    expect(alpha.symlinkTarget).toBe(targetA);
    expect(alpha.fileSize).toBe(0);
  });

  test("includes broken symlinks as seeds (fileSize=null)", async () => {
    const movies = join(root, "movies");
    await mkdir(movies, { recursive: true });
    const dangling = join(root, "this/does/not/exist.mkv");
    await symlink(dangling, join(movies, "broken.mkv"));

    const { discoverFiles } = await import("./broken-link?bust=" + Date.now());
    const seeds = await discoverFiles({
      basePath: root,
      mediaDirs: ["movies"],
      concurrency: 4,
    });

    expect(seeds).toHaveLength(1);
    expect(seeds[0].fileSize).toBeNull();
  });

  test("skips dirs whose media name doesn't exist", async () => {
    const { discoverFiles } = await import("./broken-link?bust=" + Date.now());
    const seeds = await discoverFiles({
      basePath: root,
      mediaDirs: ["movies", "tv", "special"],
      concurrency: 4,
    });
    expect(seeds).toEqual([]);
  });
});

describe("isBrokenSymlink", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "blf-broken-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("returns false for a non-symlink file", async () => {
    const f = join(root, "x.txt");
    await writeFile(f, "");
    const { isBrokenSymlink } = await import("./broken-link?bust=" + Date.now());
    expect(await isBrokenSymlink(f)).toBe(false);
  });

  test("returns false for a symlink whose target exists", async () => {
    const target = join(root, "real");
    await writeFile(target, "");
    const link = join(root, "link");
    await symlink(target, link);
    const { isBrokenSymlink } = await import("./broken-link?bust=" + Date.now());
    expect(await isBrokenSymlink(link)).toBe(false);
  });

  test("returns true for a symlink whose target is missing", async () => {
    const link = join(root, "link");
    await symlink(join(root, "missing"), link);
    const { isBrokenSymlink } = await import("./broken-link?bust=" + Date.now());
    expect(await isBrokenSymlink(link)).toBe(true);
  });
});

// ── probeFileReadable (mocked Bun.spawn) ─────────────────────────────────

describe("probeFileReadable (mocked Bun.spawn)", () => {
  let originalBunSpawn: typeof Bun.spawn | undefined;
  let spawnImpl: ((...args: Parameters<typeof Bun.spawn>) => unknown) | undefined;

  beforeEach(() => {
    originalBunSpawn = Bun.spawn;
    Bun.spawn = ((...args: Parameters<typeof Bun.spawn>) => spawnImpl!(...args)) as typeof Bun.spawn;
  });
  afterEach(() => {
    if (originalBunSpawn) {
      Bun.spawn = originalBunSpawn;
    }
    spawnImpl = undefined;
  });

  function makeFakeProc(opts: {
    exitCode: number;
    stdout?: string;
    stderr?: string;
    /** If set, the proc.exited promise never resolves (forces timeout). */
    hang?: boolean;
  }) {
    const stdoutLines = (opts.stdout ?? "").split("\n").filter((l) => l.trim().length > 0).length;
    const stdoutStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(opts.stdout ?? "");
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const stderrStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(opts.stderr ?? "");
        controller.enqueue(bytes);
        controller.close();
      },
    });
    return {
      stdout: stdoutStream,
      stderr: stderrStream,
      exited: opts.hang
        ? new Promise(() => {}) // never resolves
        : Promise.resolve(opts.exitCode as 0 | 1),
      kill: () => {},
    } as unknown as ReturnType<typeof Bun.spawn>;
  }

  test("returns ok=true with packet count when ffprobe emits packets", async () => {
    spawnImpl = () => makeFakeProc({ exitCode: 0, stdout: "a\nb\nc\n" });
    const { probeFileReadable } = await import("./broken-link?bust=" + Date.now());
    const r = await probeFileReadable("/dev/null", 5);
    expect(r.ok).toBe(true);
    expect(r.packets).toBe(3);
    expect(r.error).toBeUndefined();
  });

  test("returns ok=false with 'no packets' when ffprobe exits 0 but emits nothing", async () => {
    spawnImpl = () => makeFakeProc({ exitCode: 0, stdout: "" });
    const { probeFileReadable } = await import("./broken-link?bust=" + Date.now());
    const r = await probeFileReadable("/dev/null", 5);
    expect(r.ok).toBe(false);
    expect(r.packets).toBe(0);
    expect(r.error).toMatch(/no packets/);
  });

  test("returns ok=false with stderr message on non-zero exit", async () => {
    spawnImpl = () => makeFakeProc({ exitCode: 1, stderr: "Invalid data found" });
    const { probeFileReadable } = await import("./broken-link?bust=" + Date.now());
    const r = await probeFileReadable("/dev/null", 5);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Invalid data found/);
  });

  test("returns ok=false on timeout and kills the proc", async () => {
    let killed = false;
    const proc = {
      ...makeFakeProc({ exitCode: 0, stdout: "a\n", hang: true }),
      kill: () => { killed = true; },
    };
    spawnImpl = () => proc;
    const { probeFileReadable } = await import("./broken-link?bust=" + Date.now());
    const r = await probeFileReadable("/dev/null", 0); // 0s timeout
    // Allow microtasks to flush the kill.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/timeout/);
    expect(killed).toBe(true);
  });
});

// Keep the import-warning quiet: we use `mock` in the timeout test path
// only through the Bun.spawn override above, so the import below is
// a no-op for clarity.
void mock;
