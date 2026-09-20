/**
 * Unit tests for POST /api/scraper/download
 *
 * This route:
 *   1. Validates { id }
 *   2. Loads the scrape_result row
 *   3. Calls ZurgClient.addMagnet for a magnet URI, or fetches an HTTP(S)
 *      torrent URL and calls addTorrent
 *   4. Marks the row downloaded + hidden
 *
 * It also has an SSRF guard rejecting loopback / private IPs in
 * torrentLink URLs.
 *
 * We mock @/lib/db, @/lib/clients/zurg, and globalThis.fetch.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";

let testDB: TestDB;
let addMagnetMock: ReturnType<typeof mock>;
let addTorrentMock: ReturnType<typeof mock>;
let zurgCtorMock: ReturnType<typeof mock>;

const mockZurgModule = {
  ZurgClient: class {
    constructor(_url?: string, _apiKey?: string) {
      zurgCtorMock(_url, _apiKey);
    }
    addMagnet = (..._args: unknown[]) => addMagnetMock(..._args);
    addTorrent = (..._args: unknown[]) => addTorrentMock(..._args);
  },
};

const originalFetch = globalThis.fetch;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
  mock.module("@/lib/clients/zurg", () => mockZurgModule);
});

afterAll(async () => {
  await testDB.cleanup();
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(async () => {
  await testDB.db.scrapeResult.deleteMany();
  addMagnetMock = mock(async () => {});
  addTorrentMock = mock(async () => {});
  zurgCtorMock = mock(() => {});
  // The mock class methods close over these variables.
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

async function seed(opts: {
  source: string;
  title: string;
  magnetLink?: string | null;
  torrentLink?: string | null;
}) {
  return testDB.db.scrapeResult.create({
    data: {
      source: opts.source,
      title: opts.title,
      uniqueKey: `download-${opts.title}-${Date.now()}-${Math.random()}`,
      magnetLink: opts.magnetLink ?? null,
      torrentLink: opts.torrentLink ?? null,
    },
  });
}

// ── POST /api/scraper/download ───────────────────────────────────────────

describe("POST /api/scraper/download", () => {
  test("returns 400 on invalid JSON body", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/scraper/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req as never);
    expect(status(res)).toBe(400);
    expect(await jsonBody(res)).toEqual({ error: "Invalid JSON body" });
  });

  test("returns 400 on missing id", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/download", {}));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Validation failed");
  });

  test("returns 400 on non-positive id", async () => {
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/download", { id: -5 }));
    expect(status(res)).toBe(400);
  });

  test("returns 400 when the row has neither magnet nor torrent", async () => {
    const row = await seed({ source: "141jav", title: "no links" });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/download", { id: row.id }));
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe("No magnet or torrent link");
  });

  test("magnet path: calls ZurgClient.addMagnet and marks the row downloaded", async () => {
    const row = await seed({
      source: "141jav",
      title: "magnet item",
      magnetLink: "magnet:?xt=urn:btih:DEADBEEF",
    });
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/download", { id: row.id }));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true, id: row.id });

    expect(addMagnetMock).toHaveBeenCalledTimes(1);
    expect(addMagnetMock.mock.calls[0][0]).toBe("magnet:?xt=urn:btih:DEADBEEF");
    expect(addTorrentMock).not.toHaveBeenCalled();

    const after = await testDB.db.scrapeResult.findUnique({
      where: { id: row.id },
    });
    expect(after?.isDownloaded).toBe(true);
    expect(after?.isHidden).toBe(true);
    expect(after?.hiddenAt).toBeInstanceOf(Date);
  });

  test("magnet path: uses DB-stored zurg_url when env is unset", async () => {
    const envUrl = process.env.ZURG_URL;
    delete process.env.ZURG_URL;
    try {
      await testDB.db.config.upsert({
        where: { id: 1 },
        update: { configJson: JSON.stringify({ zurg_url: "http://db-zurg:9999" }) },
        create: { id: 1, configJson: JSON.stringify({ zurg_url: "http://db-zurg:9999" }) },
      });
      const row = await seed({ source: "141jav", title: "db url item", magnetLink: "magnet:?xt=urn:btih:CAFEBABE" });
      const { POST } = await loadRoute();
      const res = await POST(jsonRequest("/api/scraper/download", { id: row.id }));
      expect(status(res)).toBe(200);
      expect(zurgCtorMock).toHaveBeenCalledWith("http://db-zurg:9999", "");
      expect(addMagnetMock).toHaveBeenCalledTimes(1);
    } finally {
      if (envUrl === undefined) delete process.env.ZURG_URL;
      else process.env.ZURG_URL = envUrl;
      await testDB.db.config.deleteMany({ where: { id: 1 } });
    }
  });

  test("torrent path: fetches the .torrent, then calls addTorrent with sanitized filename", async () => {
    const row = await seed({
      source: "pornrips",
      title: "Some/Movie: 2024",
      torrentLink: "https://example.com/release.torrent",
    });

    const torrentBytes = new TextEncoder().encode("d8:announce42:udp://tracker.example.com:80e").buffer;
    globalThis.fetch = mock(async () => new Response(torrentBytes, { status: 200 })) as unknown as typeof fetch;

    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/download", { id: row.id }));
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ success: true, id: row.id });

    expect(addMagnetMock).not.toHaveBeenCalled();
    expect(addTorrentMock).toHaveBeenCalledTimes(1);
    const [data, filename] = addTorrentMock.mock.calls[0];
    expect(filename).toBe("Some_Movie_ 2024.torrent");
    expect(data).toBeInstanceOf(ArrayBuffer);

    const after = await testDB.db.scrapeResult.findUnique({
      where: { id: row.id },
    });
    expect(after?.isDownloaded).toBe(true);
  });

  test("HTTP URL in magnetLink is uploaded as a torrent", async () => {
    const torrentUrl = "https://example.com/from-magnet-field.torrent";
    const row = await seed({
      source: "141jav",
      title: "URL in magnet field",
      magnetLink: torrentUrl,
    });
    let requestedUrl = "";
    globalThis.fetch = mock(async (input) => {
      requestedUrl = String(input);
      return new Response(new TextEncoder().encode("torrent").buffer, { status: 200 });
    }) as unknown as typeof fetch;

    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/download", { id: row.id }));

    expect(status(res)).toBe(200);
    expect(requestedUrl).toBe(torrentUrl);
    expect(addMagnetMock).not.toHaveBeenCalled();
    expect(addTorrentMock).toHaveBeenCalledTimes(1);
  });

  test("torrent path: rejects loopback / private / link-local URLs (SSRF guard)", async () => {
    const unsafe = [
      "http://localhost/release.torrent",
      "http://localhost.localdomain/release.torrent",
      "http://127.0.0.1/release.torrent",
      "http://127.0.0.5/release.torrent",
      "http://10.0.0.1/release.torrent",
      "http://172.16.0.1/release.torrent",
      "http://192.168.1.1/release.torrent",
      "http://169.254.169.254/latest/meta-data/", // AWS IMDS
      "http://[::1]/release.torrent", // IPv6 loopback
      "http://[fc00::1]/release.torrent", // IPv6 unique-local
      "http://[fd12::1]/release.torrent", // IPv6 unique-local
      "http://[fe80::1]/release.torrent", // IPv6 link-local
      "http://[fe90::1]/release.torrent", // IPv6 link-local /10
      "http://[::ffff:127.0.0.1]/release.torrent", // IPv4-mapped loopback
      "ftp://example.com/release.torrent", // wrong protocol
      "not-a-url-at-all", // unparseable
    ];
    for (const url of unsafe) {
      globalThis.fetch = mock(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
      const row = await seed({
        source: "pornrips",
        title: `unsafe-${url}-${Date.now()}-${Math.random()}`,
        torrentLink: url,
      });
      const { POST } = await loadRoute();
      const res = await POST(jsonRequest("/api/scraper/download", { id: row.id }));
      expect(status(res)).toBe(400);
      const body = (await jsonBody(res)) as { success: boolean; error: string };
      expect(body.error).toBe("Invalid torrent URL");
      // The row should not be marked downloaded.
      const after = await testDB.db.scrapeResult.findUnique({
        where: { id: row.id },
      });
      expect(after?.isDownloaded).toBe(false);
    }
  });

  test("torrent path: returns 502 when the torrent fetch returns non-2xx", async () => {
    const row = await seed({
      source: "pornrips",
      title: "404 torrent",
      torrentLink: "https://example.com/missing.torrent",
    });
    globalThis.fetch = mock(async () => new Response("not found", { status: 404 })) as unknown as typeof fetch;
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/download", { id: row.id }));
    expect(status(res)).toBe(502);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Torrent unavailable: HTTP 404");
    expect(addTorrentMock).not.toHaveBeenCalled();
  });

  test("returns 500 when Zurg.addMagnet throws", async () => {
    const row = await seed({
      source: "141jav",
      title: "broken magnet",
      magnetLink: "magnet:?xt=urn:btih:FAIL",
    });
    addMagnetMock = mock(async () => {
      throw new Error("Zurg 500");
    });
    // The mock class's instance method closes over addMagnetMock, so
    // reassigning the variable is enough.
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/download", { id: row.id }));
    expect(status(res)).toBe(500);
    const body = (await jsonBody(res)) as { error: string };
    expect(body.error).toBe("Failed to submit to Zurg");

    // The row should NOT be marked downloaded on failure.
    const after = await testDB.db.scrapeResult.findUnique({
      where: { id: row.id },
    });
    expect(after?.isDownloaded).toBe(false);
  });

  test("prefers torrent when both magnet AND torrent are present", async () => {
    const row = await seed({
      source: "141jav",
      title: "both links",
      magnetLink: "magnet:?xt=urn:btih:AAA",
      torrentLink: "https://example.com/both.torrent",
    });
    globalThis.fetch = mock(async () => new Response("torrent", { status: 200 })) as unknown as typeof fetch;
    const { POST } = await loadRoute();
    const res = await POST(jsonRequest("/api/scraper/download", { id: row.id }));
    expect(status(res)).toBe(200);
    expect(addMagnetMock).not.toHaveBeenCalled();
    expect(addTorrentMock).toHaveBeenCalledTimes(1);
  });
});
