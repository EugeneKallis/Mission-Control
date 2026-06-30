/**
 * Unit tests for POST /api/bl-finder/recheck (bulk) and
 * POST /api/bl-finder/recheck/[id] (single).
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonBody, jsonRequest, status } from "@/test-utils/route-helpers";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.fileCheck.deleteMany();
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

async function loadRecheckOne() {
  return import(`./[id]/route?bust=${Date.now()}-${Math.random()}`);
}

async function seed(p: { filePath: string; status?: string; mediaDir?: string }) {
  return testDB.db.fileCheck.create({
    data: {
      filePath: p.filePath,
      status: p.status ?? "ok",
      mediaDir: p.mediaDir ?? "special",
    },
  });
}

describe("POST /api/bl-finder/recheck (bulk)", () => {
  test("marks all non-ignored rows back to pending", async () => {
    await seed({ filePath: "/m/a.mkv" });
    await seed({ filePath: "/m/b.mkv" });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/bl-finder/recheck", {}, "POST"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { updated: number };
    expect(body.updated).toBe(2);
    const rows = await testDB.db.fileCheck.findMany();
    for (const r of rows) expect(r.status).toBe("pending");
  });

  test("filters by mediaDir when provided", async () => {
    await seed({ filePath: "/m/a.mkv", mediaDir: "movies" });
    await seed({ filePath: "/m/b.mkv", mediaDir: "special" });
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest("/api/bl-finder/recheck", { mediaDir: "movies" }, "POST"),
    );
    const body = (await jsonBody(res)) as { updated: number };
    expect(body.updated).toBe(1);
    const movies = await testDB.db.fileCheck.findFirstOrThrow({ where: { filePath: "/m/a.mkv" } });
    const special = await testDB.db.fileCheck.findFirstOrThrow({ where: { filePath: "/m/b.mkv" } });
    expect(movies.status).toBe("pending");
    expect(special.status).toBe("ok");
  });

  test("ignores ignored rows", async () => {
    await seed({ filePath: "/m/a.mkv" });
    await seed({ filePath: "/m/b.mkv" });
    await testDB.db.fileCheck.update({
      where: { filePath: "/m/b.mkv" },
      data: { isIgnored: true },
    });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/bl-finder/recheck", {}, "POST"));
    const body = (await jsonBody(res)) as { updated: number };
    expect(body.updated).toBe(1);
  });

  test("returns 400 on invalid JSON", async () => {
    const { POST } = await loadRoute();
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/bl-finder/recheck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
      duplex: "half",
    });
    const res = await POST(req);
    expect(status(res)).toBe(400);
  });
});

describe("POST /api/bl-finder/recheck/[id]", () => {
  test("rejects non-numeric id", async () => {
    const { POST } = await loadRecheckOne();
    const res = await POST(
      new (await import("next/server")).NextRequest(
        "http://localhost/api/bl-finder/recheck/abc",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(status(res)).toBe(400);
  });

  test("returns 404 for non-existent row", async () => {
    const { POST } = await loadRecheckOne();
    const res = await POST(
      new (await import("next/server")).NextRequest(
        "http://localhost/api/bl-finder/recheck/999",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "999" }) },
    );
    expect(status(res)).toBe(404);
  });

  test("rechecks the row inline and updates the DB (using mocked probe)", async () => {
    const row = await seed({ filePath: "/m/a.mkv", status: "ok" });

    // Mock the probe to return ok=true. We do this by mocking
    // @/lib/broken-link — the test must run before the [id] route loads.
    const probeMock = mock(async () => ({ ok: true, packets: 5, elapsedMs: 1 }));
    mock.module("@/lib/broken-link", () => ({
      probeFileReadable: probeMock,
      discoverFiles: async () => [],
      isBrokenSymlink: async () => true,
      MEDIA_EXTS: new Set<string>(),
      DEFAULT_PROBE_TIMEOUT_S: 30,
      MIN_PACKETS_FOR_OK: 1,
      extOf: () => "",
      isMedia: () => false,
      toPosix: (p: string) => p,
    }));

    const { POST } = await loadRecheckOne();
    const res = await POST(
      new (await import("next/server")).NextRequest(
        `http://localhost/api/bl-finder/recheck/${row.id}`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: String(row.id) }) },
    );
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { row: { status: string; checkCount: number } };
    expect(body.row.status).toBe("ok");
    expect(body.row.checkCount).toBe(1);
  });
});
