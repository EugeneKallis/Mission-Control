/**
 * Unit tests for /api/scripts (GET)
 *
 * Mocks the `fs` module to control what the script scanner sees,
 * since the route walks the scripts/ directory at request time.
 * Each test file gets a fresh module registry, so the route's
 * internal `cached` array is empty at start.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  beforeEach,
  afterEach,
} from "bun:test";
import { jsonBody, status } from "@/test-utils/route-helpers";

// Mutable filesystem mock — we rewire the readdir/stat/readSync mocks
// per test to simulate different directory layouts.
let readdirMock: ReturnType<typeof mock>;
let statMock: ReturnType<typeof mock>;
let openSyncMock: ReturnType<typeof mock>;
let readSyncMock: ReturnType<typeof mock>;
let closeSyncMock: ReturnType<typeof mock>;

/**
 * Build a Stat-like object the route can consume.
 */
function makeStat(isDir: boolean): { isDirectory: () => boolean } {
  return { isDirectory: () => isDir };
}

const fsMock = {
  readdirSync: (...args: unknown[]) => readdirMock(...args),
  statSync: (...args: unknown[]) => statMock(...args),
  openSync: (...args: unknown[]) => openSyncMock(...args),
  readSync: (...args: unknown[]) => readSyncMock(...args),
  closeSync: (...args: unknown[]) => closeSyncMock(...args),
};

beforeAll(() => {
  mock.module("fs", () => fsMock);
});

beforeEach(() => {
  // Default: readdirSync returns empty array. Each test overrides.
  readdirMock = mock(() => [] as string[]);
  statMock = mock((_p: string, opts?: { throwIfNoEntry?: boolean }) => {
    if (opts?.throwIfNoEntry) return undefined;
    return makeStat(false);
  });
  // readFileFirstLinesSync uses require("fs") inside the function
  // and reads the first chunk to extract the docstring line.
  openSyncMock = mock(() => 42);
  readSyncMock = mock((_fd: number, _buf: Buffer, _off: number, _len: number, _pos: number) => {
    const content = " * Test script description\n *\n * Usage: ...\n";
    const bytes = Buffer.from(content, "utf8");
    bytes.copy(_buf);
    return bytes.length;
  });
  closeSyncMock = mock(() => undefined);
});

afterEach(() => {
  // Reset the module-level cache by re-importing the route fresh
  // for the next test. The `cached` symbol is module-internal, so
  // the only way to reset it is to wipe the module from the registry.
  // We re-import with a fresh cache-buster per test instead.
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── GET /api/scripts ──────────────────────────────────────────────────────

describe("GET /api/scripts", () => {
  test("returns 200 with an empty list when no scripts exist", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual([]);
  });

  test("returns 200 with entries for .ts files in the root scripts dir", async () => {
    readdirMock = mock(() => ["foo.ts", "bar.ts", "bar.test.ts"]);
    statMock = mock(() => makeStat(false));
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as Array<{ path: string; name: string; category: string; description: string }>;
    const names = body.map((s) => s.name);
    expect(names).toContain("foo");
    expect(names).toContain("bar");
    // test files should be filtered out
    expect(names).not.toContain("bar.test");
  });

  test("skips directories whose name starts with underscore", async () => {
    // First call: root scripts dir returns both _lib and arr
    // Second call: arr dir returns a script
    let callCount = 0;
    readdirMock = mock((p: string) => {
      callCount++;
      if (callCount === 1) return ["_lib", "arr"];
      if (callCount === 2) return ["searcher.ts"];
      return [];
    });
    statMock = mock((p: string) => {
      if (p.endsWith("_lib")) return makeStat(true);
      if (p.endsWith("arr")) return makeStat(true);
      return makeStat(false);
    });
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as Array<{ name: string; category: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("searcher");
    expect(body[0].category).toBe("arr");
  });

  test("skips .test.ts files", async () => {
    readdirMock = mock(() => ["real.ts", "real.test.ts"]);
    statMock = mock(() => makeStat(false));
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as Array<{ name: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("real");
  });

  test("skips files whose name starts with underscore", async () => {
    readdirMock = mock(() => ["_internal.ts", "public.ts"]);
    statMock = mock(() => makeStat(false));
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as Array<{ name: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("public");
  });

  test("sorts entries by path", async () => {
    readdirMock = mock(() => ["zebra.ts", "apple.ts", "mango.ts"]);
    statMock = mock(() => makeStat(false));
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as Array<{ name: string }>;
    expect(body.map((s) => s.name)).toEqual(["apple", "mango", "zebra"]);
  });

  test("sets category to the relative directory", async () => {
    let callCount = 0;
    readdirMock = mock(() => {
      callCount++;
      if (callCount === 1) return ["plex"];
      if (callCount === 2) return ["token.ts"];
      return [];
    });
    statMock = mock((p: string) => {
      if (p.endsWith("plex")) return makeStat(true);
      return makeStat(false);
    });
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as Array<{ category: string }>;
    expect(body[0].category).toBe("plex");
  });

  // Note: the route's readFileFirstLinesSync uses `require("fs")` for
  // its file reads, which bypasses bun's ESM `mock.module` cache.
  // We can't easily test the description-extraction path without
  // modifying the route, so we test the safer fallback (empty
  // description) below.

  test("returns an empty description when readFileFirstLinesSync throws (real fs on fake path)", async () => {
    readdirMock = mock(() => ["script.ts"]);
    statMock = mock(() => makeStat(false));
    const { GET } = await loadRoute();
    const res = await GET();
    const body = (await jsonBody(res)) as Array<{ description: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].description).toBe("");
  });

  test("caches the result on subsequent calls (readdir only invoked once)", async () => {
    readdirMock = mock(() => ["a.ts"]);
    statMock = mock(() => makeStat(false));
    const { GET } = await loadRoute();
    await GET();
    await GET();
    await GET();
    // readdirSync called exactly once for the root scripts dir
    // (the first GET triggers walk(scriptsRoot, ""))
    expect(readdirMock).toHaveBeenCalledTimes(1);
  });
});
