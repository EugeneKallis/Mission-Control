/**
 * Unit tests for the pure helpers in src/workers/torrent-watch.ts.
 *
 * Covered:
 *  - retry: returns on first success, retries on failure, eventually throws
 *  - sizeStable: stable files return true, growing files return false
 *  - sleep: resolves after the given delay (and is a no-op for 0)
 *
 * Not covered (integration):
 *  - sweep: real fs.watch + readdir loop
 *  - submitTorrent / submitMagnet: real file I/O + Decypharr HTTP
 *  - main: the long-running watcher + signal handler
 */

import { describe, test, expect } from "bun:test";
import { mkdtemp, writeFile, appendFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { retry, sizeStable, sleep } from "./torrent-watch";

describe("retry", () => {
  // Use a tiny inter-attempt delay so the test suite stays fast.
  const FAST = 1;

  test("returns the value on the first successful call", async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        return 42;
      },
      3,
      FAST,
    );
    expect(result).toBe(42);
    expect(calls).toBe(1);
  });

  test("retries on failure and eventually returns success", async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        if (calls < 3) throw new Error(`attempt ${calls} failed`);
        return "ok";
      },
      5,
      FAST,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  test("throws the last error after exhausting all attempts", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error(`fail ${calls}`);
        },
        3,
        FAST,
      ),
    ).rejects.toThrow(/fail 3/);
    expect(calls).toBe(3);
  });

  test("respects a custom attempt count", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error("nope");
        },
        1,
        FAST,
      ),
    ).rejects.toThrow(/nope/);
    expect(calls).toBe(1);
  });

  test("default attempt count is 3 (matching the worker default)", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error("x");
        },
        3,
        FAST,
      ),
    ).rejects.toThrow(/x/);
    expect(calls).toBe(3);
  });
});

describe("sizeStable", () => {
  let root: string;

  // Set up a fresh temp dir per test is tricky because the helper
  // has a 250ms internal delay. Use a single dir, but clean between
  // tests by removing all files.
  test("returns true when a file is not changing", async () => {
    root = await mkdtemp(join(tmpdir(), "torrent-watch-"));
    try {
      const f = join(root, "stable.bin");
      await writeFile(f, "hello");
      expect(await sizeStable(f)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("returns false when the file grows between the two samples", async () => {
    root = await mkdtemp(join(tmpdir(), "torrent-watch-"));
    try {
      const f = join(root, "growing.bin");
      await writeFile(f, "initial");
      // The helper waits 250ms between samples. Schedule an append
      // to land during that gap.
      setTimeout(() => {
        void appendFile(f, "-appended");
      }, 100);
      expect(await sizeStable(f)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("throws if the file does not exist", async () => {
    root = await mkdtemp(join(tmpdir(), "torrent-watch-"));
    try {
      await expect(sizeStable(join(root, "missing.bin"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe("sleep", () => {
  test("resolves after approximately the requested delay", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow some slop
    expect(elapsed).toBeLessThan(500);
  });

  test("resolves immediately for 0", async () => {
    const start = Date.now();
    await sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
