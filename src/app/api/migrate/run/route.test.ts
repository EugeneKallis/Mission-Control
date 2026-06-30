/**
 * Unit tests for /api/migrate/run (POST)
 *
 * Mocks @/lib/migrate (resolveSourcePath, readSourceSnapshot,
 * applySnapshot) and @/lib/db, then re-imports the route module
 * with a cache-busting query string.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  beforeEach,
} from "bun:test";
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";
import { SourceDbError } from "@/lib/migrate";

let resolveSourcePathMock: ReturnType<typeof mock>;
let readSourceSnapshotMock: ReturnType<typeof mock>;
let applySnapshotMock: ReturnType<typeof mock>;

const fakeDb = { /* not called in mocked scenario */ };

beforeAll(() => {
  mock.module("@/lib/db", () => ({ db: fakeDb }));
  mock.module("@/lib/migrate", () => ({
    resolveSourcePath: (...args: unknown[]) => resolveSourcePathMock(...args),
    readSourceSnapshot: (...args: unknown[]) => readSourceSnapshotMock(...args),
    applySnapshot: (...args: unknown[]) => applySnapshotMock(...args),
    SourceDbError,
  }));
});

beforeEach(() => {
  resolveSourcePathMock = mock(async () => ({
    absolutePath: "/tmp/source.db",
    sizeBytes: 4096,
  }));
  readSourceSnapshotMock = mock(async () => ({ /* empty snapshot */ } as never));
  applySnapshotMock = mock(async () => ({
    macroGroups: { total: 0, inserted: 0, skipped: 0 },
    macros: { total: 0, inserted: 0, skipped: 0 },
    scrapeResults: { total: 0, inserted: 0, skipped: 0 },
    scrapedItems: { total: 0, inserted: 0, skipped: 0 },
    scrapedItemFiles: { total: 0, inserted: 0, skipped: 0 },
  }));
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── POST /api/migrate/run ─────────────────────────────────────────────────

describe("POST /api/migrate/run", () => {
  test("returns 200 with the result on happy path", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/migrate/run", {
        dbPath: "/tmp/source.db",
        tables: { macros: true },
      }),
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      dbPath: string;
      result: { macros: { total: number; inserted: number; skipped: number } };
    };
    expect(body.dbPath).toBe("/tmp/source.db");
    expect(body.result.macros).toBeDefined();
  });

  test("calls resolveSourcePath, readSourceSnapshot, applySnapshot in order", async () => {
    const callOrder: string[] = [];
    resolveSourcePathMock = mock(async () => {
      callOrder.push("resolve");
      return { absolutePath: "/tmp/source.db", sizeBytes: 4096 };
    });
    readSourceSnapshotMock = mock(async () => {
      callOrder.push("read");
      return {} as never;
    });
    applySnapshotMock = mock(async () => {
      callOrder.push("apply");
      return {
        macroGroups: { total: 0, inserted: 0, skipped: 0 },
        macros: { total: 0, inserted: 0, skipped: 0 },
        scrapeResults: { total: 0, inserted: 0, skipped: 0 },
        scrapedItems: { total: 0, inserted: 0, skipped: 0 },
        scrapedItemFiles: { total: 0, inserted: 0, skipped: 0 },
      };
    });
    const { POST } = await loadRoute();
    await POST(
      jsonRequest("/api/migrate/run", {
        dbPath: "/tmp/source.db",
        tables: { macros: true },
      }),
    );
    expect(callOrder).toEqual(["resolve", "read", "apply"]);
  });

  test("passes the selected table flags to applySnapshot", async () => {
    const { POST } = await loadRoute();
    await POST(
      jsonRequest("/api/migrate/run", {
        dbPath: "/tmp/source.db",
        tables: {
          macroGroups: true,
          macros: true,
          scrapeResults: false,
          scrapedItems: false,
          scrapedItemFiles: false,
        },
      }),
    );
    expect(applySnapshotMock).toHaveBeenCalledTimes(1);
    const opts = applySnapshotMock.mock.calls[0][2] as Record<string, boolean>;
    expect(opts.macroGroups).toBe(true);
    expect(opts.macros).toBe(true);
    expect(opts.scrapeResults).toBe(false);
  });

  test("returns 400 on invalid JSON body", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/migrate/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req);
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid JSON body" });
  });

  test("returns 400 on missing dbPath", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/migrate/run", { tables: { macros: true } }),
    );
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 when no tables are selected", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/migrate/run", {
        dbPath: "/tmp/source.db",
        tables: {},
      }),
    );
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Select at least one table to migrate");
    // resolveSourcePath should NOT have been called
    expect(resolveSourcePathMock).not.toHaveBeenCalled();
  });

  test("returns 400 when resolveSourcePath throws SourceDbError", async () => {
    resolveSourcePathMock = mock(async () => {
      throw new SourceDbError("File not found");
    });
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/migrate/run", {
        dbPath: "/tmp/missing.db",
        tables: { macros: true },
      }),
    );
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("File not found");
    // No point reading or applying if resolve failed
    expect(readSourceSnapshotMock).not.toHaveBeenCalled();
    expect(applySnapshotMock).not.toHaveBeenCalled();
  });

  test("returns 400 when applySnapshot throws SourceDbError", async () => {
    applySnapshotMock = mock(async () => {
      throw new SourceDbError("FK constraint failed");
    });
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/migrate/run", {
        dbPath: "/tmp/source.db",
        tables: { macros: true },
      }),
    );
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("FK constraint failed");
  });

  test("returns 500 on a non-SourceDbError from applySnapshot", async () => {
    applySnapshotMock = mock(async () => {
      throw new Error("disk full");
    });
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/migrate/run", {
        dbPath: "/tmp/source.db",
        tables: { macros: true },
      }),
    );
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to run migration" });
  });

  test("defaults unspecified table flags to false", async () => {
    const { POST } = await loadRoute();
    await POST(
      jsonRequest("/api/migrate/run", {
        dbPath: "/tmp/source.db",
        tables: { macros: true },
      }),
    );
    const opts = applySnapshotMock.mock.calls[0][2] as Record<string, boolean>;
    expect(opts.macroGroups).toBe(false);
    expect(opts.scrapeResults).toBe(false);
    expect(opts.scrapedItems).toBe(false);
    expect(opts.scrapedItemFiles).toBe(false);
  });
});
