/**
 * Unit tests for /api/migrate/preview (POST)
 *
 * Mocks @/lib/migrate so we can drive previewSource with both
 * success and failure scenarios.
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

let previewSourceMock: ReturnType<typeof mock>;

beforeAll(() => {
  mock.module("@/lib/migrate", () => ({
    previewSource: (...args: unknown[]) => previewSourceMock(...args),
    SourceDbError,
  }));
});

beforeEach(() => {
  previewSourceMock = mock(async () => ({
    dbPath: "/tmp/source.db",
    dbSizeBytes: 4096,
    present: {
      macroGroups: true,
      macros: true,
      scrapeResults: false,
      scrapedItems: false,
      scrapedItemFiles: false,
    },
    counts: {
      macroGroups: 2,
      macros: 7,
      scrapeResults: 0,
      scrapedItems: 0,
      scrapedItemFiles: 0,
    },
    isSqlite: true,
  }));
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── POST /api/migrate/preview ─────────────────────────────────────────────

describe("POST /api/migrate/preview", () => {
  test("returns 200 with the SourceInfo on happy path", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/migrate/preview", { dbPath: "/tmp/source.db" }));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      dbPath: string;
      dbSizeBytes: number;
      present: { macros: boolean };
      counts: { macros: number };
      isSqlite: boolean;
    };
    expect(body.dbPath).toBe("/tmp/source.db");
    expect(body.dbSizeBytes).toBe(4096);
    expect(body.present.macros).toBe(true);
    expect(body.counts.macros).toBe(7);
    expect(body.isSqlite).toBe(true);
  });

  test("passes the dbPath to previewSource", async () => {
    const { POST } = await loadRoute();
    await POST(jsonRequest("/api/migrate/preview", { dbPath: "/var/db/legacy.db" }));
    expect(previewSourceMock).toHaveBeenCalledTimes(1);
    expect(previewSourceMock.mock.calls[0][0]).toBe("/var/db/legacy.db");
  });

  test("returns 400 on invalid JSON body", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/migrate/preview", {
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
    const res = await POST(jsonRequest("/api/migrate/preview", {}));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string; details: unknown };
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  test("returns 400 on empty dbPath", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/migrate/preview", { dbPath: "" }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 when previewSource throws SourceDbError", async () => {
    previewSourceMock = mock(async () => {
      throw new SourceDbError("Not a SQLite database file");
    });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/migrate/preview", { dbPath: "/tmp/bad.db" }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Not a SQLite database file");
  });

  test("returns 500 when previewSource throws a non-SourceDbError", async () => {
    previewSourceMock = mock(async () => {
      throw new Error("disk full");
    });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/migrate/preview", { dbPath: "/tmp/x.db" }));
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to preview source database" });
  });
});
