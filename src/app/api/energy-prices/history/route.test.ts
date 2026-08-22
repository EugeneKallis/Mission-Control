/**
 * Tests for GET /api/energy-prices/history?days=N
 *
 * must be its own file because mock.module("@/lib/db") is process-global.
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
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { getRequest, status, jsonBody } from "@/test-utils/route-helpers";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.energyPrice.deleteMany();
  await testDB.db.setting.deleteMany();
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe("GET /api/energy-prices/history", () => {
  test("returns 200 with empty suppliers when DB is empty", async () => {
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/energy-prices/history"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      days: number;
      targetRate: number | null;
      suppliers: { name: string; points: { t: string; rate: number }[] }[];
    };
    expect(body.days).toBe(30); // default
    expect(body.targetRate).toBeNull();
    expect(body.suppliers).toEqual([]);
  });

  test("groups rows by supplier ordered by fetchedAt asc", async () => {
    await testDB.db.energyPrice.createMany({
      data: [
        { supplier: "Acme", rate: 10.0, monthlyCost: 75, plan: "", fetchedAt: isoDaysAgo(20) },
        { supplier: "Beta", rate: 12.0, monthlyCost: 90, plan: "", fetchedAt: isoDaysAgo(20) },
        { supplier: "Acme", rate: 10.5, monthlyCost: 78, plan: "", fetchedAt: isoDaysAgo(10) },
        { supplier: "Beta", rate: 12.3, monthlyCost: 92, plan: "", fetchedAt: isoDaysAgo(5) },
      ],
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/energy-prices/history?days=30"));
    const body = (await jsonBody(res)) as {
      days: number;
      suppliers: { name: string; points: { t: string; rate: number }[] }[];
    };
    expect(body.days).toBe(30);
    // alphabetically sorted
    expect(body.suppliers.map((s) => s.name)).toEqual(["Acme", "Beta"]);
    // each supplier's points are ascending by time
    expect(body.suppliers[0].points[0].rate).toBe(10.0);
    expect(body.suppliers[0].points[1].rate).toBe(10.5);
    expect(body.suppliers[1].points[0].rate).toBe(12.0);
    expect(body.suppliers[1].points[1].rate).toBe(12.3);
  });

  test("filters out rows older than the requested days", async () => {
    await testDB.db.energyPrice.createMany({
      data: [
        { supplier: "Acme", rate: 10.0, monthlyCost: 75, plan: "", fetchedAt: isoDaysAgo(45) },
        { supplier: "Acme", rate: 10.5, monthlyCost: 78, plan: "", fetchedAt: isoDaysAgo(10) },
      ],
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/energy-prices/history?days=30"));
    const body = (await jsonBody(res)) as {
      suppliers: { name: string; points: { rate: number }[] }[];
    };
    expect(body.suppliers[0].points).toHaveLength(1);
    expect(body.suppliers[0].points[0].rate).toBe(10.5);
  });

  test("honours days=7", async () => {
    await testDB.db.energyPrice.createMany({
      data: [
        { supplier: "Acme", rate: 10.0, monthlyCost: 75, plan: "", fetchedAt: isoDaysAgo(10) },
        { supplier: "Acme", rate: 9.5, monthlyCost: 70, plan: "", fetchedAt: isoDaysAgo(5) },
        { supplier: "Acme", rate: 9.0, monthlyCost: 68, plan: "", fetchedAt: isoDaysAgo(2) },
      ],
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/energy-prices/history?days=7"));
    const body = (await jsonBody(res)) as {
      days: number;
      suppliers: { points: { rate: number }[] }[];
    };
    expect(body.days).toBe(7);
    expect(body.suppliers[0].points).toHaveLength(2);
    expect(body.suppliers[0].points[0].rate).toBe(9.5);
    expect(body.suppliers[0].points[1].rate).toBe(9.0);
  });

  test("falls back to default 30 when days param is invalid", async () => {
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/energy-prices/history?days=999"));
    const body = (await jsonBody(res)) as { days: number };
    expect(body.days).toBe(30);
  });

  test("falls back to default when days is non-numeric", async () => {
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/energy-prices/history?days=abc"));
    const body = (await jsonBody(res)) as { days: number };
    expect(body.days).toBe(30);
  });

  test("accepts every valid day preset", async () => {
    const { GET } = await loadRoute();
    for (const d of [7, 30, 60, 120, 365]) {
      const res = await GET(getRequest(`/api/energy-prices/history?days=${d}`));
      const body = (await jsonBody(res)) as { days: number };
      expect(body.days).toBe(d);
    }
  });

  test("passes the target_rate setting through", async () => {
    await testDB.db.setting.create({
      data: { key: "energy_price:target_rate", value: "11.50" },
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/energy-prices/history?days=30"));
    const body = (await jsonBody(res)) as { targetRate: number | null };
    expect(body.targetRate).toBe(11.5);
  });

  test("targetRate is null when not set", async () => {
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/energy-prices/history"));
    const body = (await jsonBody(res)) as { targetRate: number | null };
    expect(body.targetRate).toBeNull();
  });

  test("sinceIso reflects the cutoff timestamp", async () => {
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/energy-prices/history?days=7"));
    const body = (await jsonBody(res)) as { sinceIso: string; days: number };
    const cutoffMs = new Date(body.sinceIso).getTime();
    const expectedMs = Date.now() - body.days * 86400000;
    // allow ±5s slack for test runtime
    expect(Math.abs(cutoffMs - expectedMs)).toBeLessThan(5000);
  });

  test("isActive is ignored — every historical row is returned", async () => {
    await testDB.db.energyPrice.createMany({
      data: [
        { supplier: "Old", rate: 14.0, monthlyCost: 105, plan: "", isActive: false, fetchedAt: isoDaysAgo(3) },
        { supplier: "New", rate: 12.0, monthlyCost: 90, plan: "", isActive: true, fetchedAt: isoDaysAgo(2) },
      ],
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/energy-prices/history?days=30"));
    const body = (await jsonBody(res)) as { suppliers: { name: string }[] };
    const names = body.suppliers.map((s) => s.name).sort();
    expect(names).toEqual(["New", "Old"]);
  });
});
