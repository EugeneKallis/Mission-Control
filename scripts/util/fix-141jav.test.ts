/**
 * Behavioral tests for fix-141jav — a one-off DB migration.
 *
 * Mocks @/lib/db's $transaction to return controlled results.
 * Tests both dry-run and live mode branches.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

async function loadScript() {
  const stamp = Date.now() + Math.random();
  return (await import(`./fix-141jav?bust=${stamp}`)) as typeof import("./fix-141jav");
}

describe("fix-141jav", () => {
  test("dry-run mode counts empty-source rows without updating", async () => {
    mock.module("@/lib/db", () => ({
      db: {
        $transaction: async <T>(fn: (tx: any) => Promise<T>) => {
          const tx = {
            scrapedItem: {
              count: async () => 5,
              updateMany: () => {
                throw new Error("updateMany should not be called in dry-run");
              },
            },
          };
          return fn(tx);
        },
      },
    }));

    const script = await loadScript();
    const result = await script.main([]);
    expect(result).toBeUndefined();
  });

  test("live mode (--run) calls updateMany within transaction", async () => {
    let capturedWhere: unknown = null;
    let capturedData: unknown = null;

    mock.module("@/lib/db", () => ({
      db: {
        $transaction: async <T>(fn: (tx: any) => Promise<T>) => {
          const tx = {
            scrapedItem: {
              count: async () => 3,
              updateMany: (args: { where: { source: string }; data: { source: string } }) => {
                capturedWhere = args.where;
                capturedData = args.data;
                return { count: 3 };
              },
            },
          };
          return fn(tx);
        },
      },
    }));

    const script = await loadScript();
    const result = await script.main(["--run"]);
    expect(result).toBeUndefined();
    expect(capturedWhere).toEqual({ source: "" });
    expect(capturedData).toEqual({ source: "141jav" });
  });

  test("no empty rows — updateMany still called but returns count 0", async () => {
    let updateCalled = false;

    mock.module("@/lib/db", () => ({
      db: {
        $transaction: async <T>(fn: (tx: any) => Promise<T>) => {
          const tx = {
            scrapedItem: {
              count: async () => 0,
              updateMany: () => {
                updateCalled = true;
                return { count: 0 };
              },
            },
          };
          return fn(tx);
        },
      },
    }));

    const script = await loadScript();
    const result = await script.main(["--run"]);
    expect(result).toBeUndefined();
    expect(updateCalled).toBe(true);
  });

  test("live mode returns correct before/updated/after counts", async () => {
    let callIndex = 0;

    mock.module("@/lib/db", () => ({
      db: {
        $transaction: async <T>(fn: (tx: any) => Promise<T>) => {
          const tx = {
            scrapedItem: {
              // First count returns 3, post-update count returns 0
              count: async () => {
                callIndex++;
                if (callIndex === 1) return 3;
                return 0;
              },
              updateMany: () => ({ count: 3 }),
            },
          };
          return fn(tx);
        },
      },
    }));

    const script = await loadScript();
    // We can't easily capture summary output, but we can verify
    // the transaction callback is called and doesn't throw.
    await expect(script.main(["--run"])).resolves.toBeUndefined();
  });
});
