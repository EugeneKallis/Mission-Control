/**
 * Unit tests for /api/database/[table] (GET)
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
  beforeEach,
} from "bun:test";
import { getRequest, jsonBody, status } from "@/test-utils/route-helpers";

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface QueryCall {
  sql: string;
  params: unknown[];
}

let calls: QueryCall[] = [];
const fakeColumns: ColumnInfo[] = [
  { cid: 0, name: "id", type: "INTEGER", notnull: 1, dflt_value: null, pk: 1 },
  { cid: 1, name: "name", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
];

const fakeDb = {
  $queryRawUnsafe: async <T>(sql: string, ...params: unknown[]): Promise<T> => {
    calls.push({ sql, params });

    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith("PRAGMA TABLE_INFO")) {
      return fakeColumns as unknown as T;
    }
    if (trimmed.startsWith("SELECT COUNT(*)")) {
      return [{ cnt: 42 }] as unknown as T;
    }
    if (trimmed.startsWith("SELECT * FROM")) {
      return [{ id: 1, name: "alpha" }, { id: 2, name: "beta" }] as unknown as T;
    }
    return [] as unknown as T;
  },
};

beforeAll(() => {
  mock.module("@/lib/db", () => ({ db: fakeDb }));
});

afterAll(async () => {
  await Promise.resolve();
});

beforeEach(() => {
  calls = [];
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

function buildRequest(url: string) {
  return getRequest(url);
}

// ── GET /api/database/[table] ─────────────────────────────────────────────

describe("GET /api/database/[table]", () => {
  test("returns 400 on an invalid table name (injection attempt)", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/database/hax';DROP--"), {
      params: Promise.resolve({ table: "hax';DROP--" }),
    });
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid table name" });
  });

  test("returns 200 with columns, rows, and totalRows on happy path", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/database/macros"), {
      params: Promise.resolve({ table: "macros" }),
    });
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      columns: Array<{ name: string; type: string }>;
      rows: Array<{ id: number; name: string }>;
      totalRows: number;
    };
    expect(body.columns).toEqual([
      { name: "id", type: "INTEGER" },
      { name: "name", type: "TEXT" },
    ]);
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].name).toBe("alpha");
    expect(body.totalRows).toBe(42);
  });

  test("accepts numeric-only and underscore-leading table names", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/database/_prisma_xyz"), {
      params: Promise.resolve({ table: "_prisma_xyz" }),
    });
    // Should NOT return 400 — regex is ^[a-zA-Z_][a-zA-Z0-9_]*$
    expect(status(res)).toBe(200);
  });

  test("applies WHERE filters from search params", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/database/macros?name=hello"),
      { params: Promise.resolve({ table: "macros" }) },
    );
    expect(status(res)).toBe(200);
    // The last call should be the SELECT with WHERE
    const selectCall = calls.find((c) => c.sql.trim().toUpperCase().startsWith("SELECT *"));
    expect(selectCall).toBeDefined();
    expect(selectCall!.sql).toContain('WHERE "name" LIKE ?');
    expect(selectCall!.params).toEqual(["%hello%"]);
  });

  test("ignores filter params that don't match any column", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/database/macros?nonexistent_col=foo"),
      { params: Promise.resolve({ table: "macros" }) },
    );
    expect(status(res)).toBe(200);
    const selectCall = calls.find((c) => c.sql.trim().toUpperCase().startsWith("SELECT *"));
    expect(selectCall).toBeDefined();
    expect(selectCall!.sql).not.toContain("WHERE");
  });

  test("ignores empty filter values", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/database/macros?name=%20%20"),
      { params: Promise.resolve({ table: "macros" }) },
    );
    expect(status(res)).toBe(200);
    const selectCall = calls.find((c) => c.sql.trim().toUpperCase().startsWith("SELECT *"));
    expect(selectCall).toBeDefined();
    expect(selectCall!.sql).not.toContain("WHERE");
  });

  test("appends LIMIT 100 to the row query", async () => {
    const { GET } = await loadRoute();
    await GET(buildRequest("http://localhost/api/database/macros"), {
      params: Promise.resolve({ table: "macros" }),
    });
    const selectCall = calls.find((c) => c.sql.trim().toUpperCase().startsWith("SELECT *"));
    expect(selectCall!.sql).toContain("LIMIT 100");
  });

  test("returns 500 when the query throws", async () => {
    // Override the @/lib/db mock to throw (must be LAST — the mock
    // persists for the rest of the process and would break other
    // tests that rely on the `calls` array being populated).
    mock.module("@/lib/db", () => ({
      db: {
        $queryRawUnsafe: async () => {
          throw new Error("DB unavailable");
        },
      },
    }));
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/database/macros"), {
      params: Promise.resolve({ table: "macros" }),
    });
    expect(status(res)).toBe(500);
    expect(await jsonBody(res)).toEqual({ error: "Failed to query table" });
  });
});
