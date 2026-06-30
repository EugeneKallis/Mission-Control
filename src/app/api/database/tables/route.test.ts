/**
 * Unit tests for /api/database/tables (GET)
 *
 * Mocks @/lib/db with a fake Prisma client (only $queryRawUnsafe is
 * used) and re-imports the route module.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  afterAll,
} from "bun:test";
import { jsonBody, status } from "@/test-utils/route-helpers";

let queryRawUnsafeMock: ReturnType<typeof mock>;

const fakeDb = {
  $queryRawUnsafe: (..._args: unknown[]) => queryRawUnsafeMock(..._args),
};

beforeAll(() => {
  mock.module("@/lib/db", () => ({ db: fakeDb }));
});

afterAll(async () => {
  // Nothing to clean up
  await Promise.resolve();
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── GET /api/database/tables ──────────────────────────────────────────────

describe("GET /api/database/tables", () => {
  test("returns 200 with the table names in DB order", async () => {
    // The route relies on the SQL query (sqlite_master ORDER BY name)
    // for sorting, so the mock here returns pre-sorted rows.
    queryRawUnsafeMock = mock(async () => [
      { name: "history" },
      { name: "macros" },
      { name: "settings" },
    ]);
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { tables: string[] };
    expect(body.tables).toEqual(["history", "macros", "settings"]);
  });

  test("returns 200 with an empty array when no user tables exist", async () => {
    queryRawUnsafeMock = mock(async () => []);
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ tables: [] });
  });

  test("returns 500 when the query throws", async () => {
    queryRawUnsafeMock = mock(async () => {
      throw new Error("DB unavailable");
    });
    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to list tables" });
  });

  test("filters out prisma_% and _prisma_migrations at the SQL level", async () => {
    // The route's SQL includes the NOT LIKE / != filters — verify by
    // inspecting the query argument passed to $queryRawUnsafe.
    let capturedQuery = "";
    queryRawUnsafeMock = mock(async (sql: string) => {
      capturedQuery = sql;
      return [];
    });
    const { GET } = await loadRoute();
    await GET();
    expect(capturedQuery).toContain("prisma_%");
    expect(capturedQuery).toContain("_prisma_migrations");
    expect(capturedQuery).toContain("type='table'");
  });
});
