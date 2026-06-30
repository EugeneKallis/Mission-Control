/**
 * Unit tests for GET /api/scraper/results
 *
 * Strategy: spin up a temp-file Prisma client, mock @/lib/db, seed
 * scrape_result rows, and re-import the route with a cache-busting
 * query string so the mocks take effect.
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
import { getRequest, jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.scrapeResult.deleteMany();
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

async function seed(opts: {
  source: string;
  title: string;
  imageUrl?: string | null;
  magnetLink?: string | null;
  torrentLink?: string | null;
  tags?: string | null;
  isHidden?: boolean;
  isDownloaded?: boolean;
}) {
  return testDB.db.scrapeResult.create({
    data: {
      source: opts.source,
      title: opts.title,
      uniqueKey: `${opts.source}-${opts.title}-${Date.now()}-${Math.random()}`,
      imageUrl: opts.imageUrl ?? null,
      magnetLink: opts.magnetLink ?? null,
      torrentLink: opts.torrentLink ?? null,
      tags: opts.tags ?? null,
      isHidden: opts.isHidden ?? false,
      isDownloaded: opts.isDownloaded ?? false,
    },
  });
}

// ── GET /api/scraper/results ─────────────────────────────────────────────

describe("GET /api/scraper/results", () => {
  test("returns 200 and empty results when no rows exist", async () => {
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/results?source=141jav"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { results: unknown[] };
    expect(body.results).toEqual([]);
  });

  test("defaults source to 141jav when query param is missing", async () => {
    await seed({ source: "141jav", title: "Default source item" });
    await seed({ source: "projectjav", title: "Other source" });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/results"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      results: Array<{ source: string; title: string }>;
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].source).toBe("141jav");
  });

  test("returns visible rows for the given source", async () => {
    const visible = await seed({
      source: "141jav",
      title: "Visible item",
      magnetLink: "magnet:?xt=urn:btih:ABC",
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/results?source=141jav"));
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as {
      results: Array<{ id: number; source: string; title: string; magnet: string }>;
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe(visible.id);
    expect(body.results[0].title).toBe("Visible item");
    expect(body.results[0].magnet).toBe("magnet:?xt=urn:btih:ABC");
  });

  test("hides hidden rows from the response", async () => {
    await seed({ source: "141jav", title: "Visible A" });
    await seed({ source: "141jav", title: "Hidden B", isHidden: true });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/results?source=141jav"));
    const body = (await jsonBody(res)) as { results: Array<{ title: string }> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe("Visible A");
  });

  test("splits tags by comma and drops empty entries", async () => {
    await seed({
      source: "141jav",
      title: "Tagged item",
      tags: "tag1,tag2,,tag3",
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/results?source=141jav"));
    const body = (await jsonBody(res)) as { results: Array<{ tags: string[] }> };
    expect(body.results[0].tags).toEqual(["tag1", "tag2", "tag3"]);
  });

  test("returns empty tags array when tags is null", async () => {
    await seed({ source: "141jav", title: "Untagged" });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/results?source=141jav"));
    const body = (await jsonBody(res)) as { results: Array<{ tags: string[] }> };
    expect(body.results[0].tags).toEqual([]);
  });

  test("pornrips source splits imageUrl into images array and picks first as image", async () => {
    await seed({
      source: "pornrips",
      title: "Pornrips item",
      imageUrl: "https://a.example/1.jpg,https://a.example/2.jpg,https://a.example/3.jpg",
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/results?source=pornrips"));
    const body = (await jsonBody(res)) as {
      results: Array<{ image: string; images: string[] }>;
    };
    expect(body.results[0].image).toBe("https://a.example/1.jpg");
    expect(body.results[0].images).toEqual([
      "https://a.example/1.jpg",
      "https://a.example/2.jpg",
      "https://a.example/3.jpg",
    ]);
  });

  test("non-pornrips source keeps imageUrl as-is in image field, images empty", async () => {
    await seed({
      source: "141jav",
      title: "Single image",
      imageUrl: "https://a.example/cover.jpg",
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/results?source=141jav"));
    const body = (await jsonBody(res)) as {
      results: Array<{ image: string; images: string[] }>;
    };
    expect(body.results[0].image).toBe("https://a.example/cover.jpg");
    expect(body.results[0].images).toEqual([]);
  });

  test("maps response fields from DB column names (magnet/torrent/is_downloaded/is_hidden/created_at)", async () => {
    await seed({
      source: "141jav",
      title: "Field mapping item",
      magnetLink: "magnet:?xt=urn:btih:XYZ",
      torrentLink: "https://example.com/x.torrent",
      isDownloaded: true,
    });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/results?source=141jav"));
    const body = (await jsonBody(res)) as {
      results: Array<{
        magnet: string;
        torrent: string;
        is_downloaded: boolean;
        is_hidden: boolean;
        created_at: string;
      }>;
    };
    expect(body.results[0].magnet).toBe("magnet:?xt=urn:btih:XYZ");
    expect(body.results[0].torrent).toBe("https://example.com/x.torrent");
    expect(body.results[0].is_downloaded).toBe(true);
    expect(body.results[0].is_hidden).toBe(false);
    expect(typeof body.results[0].created_at).toBe("string");
  });

  test("filters by source — rows from other sources are excluded", async () => {
    await seed({ source: "141jav", title: "A" });
    await seed({ source: "projectjav", title: "B" });
    await seed({ source: "pornrips", title: "C" });
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/results?source=projectjav"));
    const body = (await jsonBody(res)) as { results: Array<{ title: string }> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe("B");
  });

  test("returns 500 when the DB throws", async () => {
    mock.module("@/lib/db/queries", () => ({
      listScrapeResults: async () => {
        throw new Error("DB unavailable");
      },
    }));
    const { GET } = await loadRoute();
    const res = await GET(getRequest("/api/scraper/results?source=141jav"));
    expect(status(res)).toBe(500);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Failed to list scrape results");
  });
});
