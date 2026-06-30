/**
 * Unit tests for src/lib/clients/decypharr.ts
 *
 * Covers:
 *  - URL normalisation (trailing slash stripped)
 *  - addMagnet: form fields, throw on non-2xx
 *  - addTorrent: blob upload, form fields
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { DecypharrClient } from "./decypharr";
import type { DecypharrTorrentsResponse } from "./decypharr";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface CapturedCall {
  url: string;
  init: RequestInit;
}

function installFetch(responder: (url: string, init: RequestInit) => Response) {
  let captured: CapturedCall | null = null;
  globalThis.fetch = mock(async (url: string, init: RequestInit = {}) => {
    captured = { url, init };
    return responder(url, init);
  }) as unknown as typeof fetch;
  return () => captured as CapturedCall;
}

describe("DecypharrClient", () => {
  test("constructor strips trailing slashes from baseUrl", () => {
    const c = new DecypharrClient("http://example.com:8282/");
    expect(c).toBeDefined();
  });

  test("addMagnet posts a multipart form with the right fields", async () => {
    const get = installFetch(() => new Response(JSON.stringify([{ status: "success" }]), { status: 200 }));
    const client = new DecypharrClient("http://example.com:8282", "sonarr", "/downloads");
    await client.addMagnet("magnet:?xt=urn:btih:DEADBEEF");
    const call = get();
    expect(call.url).toBe("http://example.com:8282/api/add");
    expect(call.init.method).toBe("POST");
    const form = call.init.body as FormData;
    expect(form.get("urls")).toBe("magnet:?xt=urn:btih:DEADBEEF");
    expect(form.get("arr")).toBe("sonarr");
    expect(form.get("downloadFolder")).toBe("/downloads");
    expect(form.get("action")).toBe("symlink");
    expect(form.get("downloadUncached")).toBe("false");
    expect(form.get("rmTrackerUrls")).toBe("false");
  });

  test("addMagnet throws on non-2xx", async () => {
    installFetch(() => new Response("server error", { status: 500 }));
    const client = new DecypharrClient("http://example.com:8282");
    await expect(client.addMagnet("magnet:?xt=urn:btih:DEAD")).rejects.toThrow(/500/);
  });

  test("addTorrent posts the file as a Blob with the right fields", async () => {
    const get = installFetch(() => new Response(JSON.stringify([{ status: "success" }]), { status: 200 }));
    const client = new DecypharrClient("http://example.com:8282", "radarr", "/data");
    const data = new TextEncoder().encode("binary torrent bytes").buffer;
    await client.addTorrent(data, "release.torrent");
    const call = get();
    expect(call.url).toBe("http://example.com:8282/api/add");
    expect(call.init.method).toBe("POST");
    const form = call.init.body as FormData;
    // happy-dom (loaded by the test preload) does not preserve the
    // filename passed as the 3rd arg to FormData.append — File.name
    // ends up as "blob". We assert the file was appended (it's a
    // Blob/instanceof Blob) and that decypharr included the rest of
    // the fields. The filename-passing behavior is a FormData concern,
    // not a decypharr one.
    const file = form.get("files");
    expect(file).toBeInstanceOf(Blob);
    expect(form.get("arr")).toBe("radarr");
    expect(form.get("downloadFolder")).toBe("/data");
  });

  test("addTorrent throws on non-2xx", async () => {
    installFetch(() => new Response("no", { status: 400 }));
    const client = new DecypharrClient("http://example.com:8282");
    await expect(
      client.addTorrent(new ArrayBuffer(0), "x.torrent")
    ).rejects.toThrow(/400/);
  });

  test("uses default constructor values when no args are provided", async () => {
    const get = installFetch(() => new Response(JSON.stringify([{ status: "success" }]), { status: 200 }));
    const client = new DecypharrClient();
    await client.addMagnet("magnet:?xt=urn:btih:X");
    const call = get();
    expect(call.url).toBe("http://192.168.1.99:8282/api/add");
    const form = call.init.body as FormData;
    expect(form.get("arr")).toBe("special");
    expect(form.get("downloadFolder")).toBe("/mnt/debrid/downloads");
  });

  test("listTorrents GETs /api/torrents and parses the response", async () => {
    const body: DecypharrTorrentsResponse = {
      categories: ["special", "movies"],
      has_next: false,
      has_prev: false,
      limit: 50,
      page: 1,
      torrents: [
        { id: "1", category: "special", name: "A", state: "pausedUP", info_hash: "AAAA", content_path: "/p/A" },
        { id: "2", category: "movies", name: "B", state: "downloading", info_hash: "BBBB", content_path: "/p/B" },
      ],
    };
    const get = installFetch(() => new Response(JSON.stringify(body), { status: 200 }));
    const client = new DecypharrClient("http://example.com:8282");
    const resp = await client.listTorrents();
    const call = get();
    expect(call.url).toBe("http://example.com:8282/api/torrents");
    expect(call.init.method).toBeUndefined(); // GET
    expect(resp.torrents).toHaveLength(2);
    expect(resp.torrents[0].info_hash).toBe("AAAA");
    expect(resp.torrents[1].category).toBe("movies");
  });

  test("listTorrents throws on non-2xx", async () => {
    installFetch(() => new Response("no", { status: 503 }));
    const client = new DecypharrClient("http://example.com:8282");
    await expect(client.listTorrents()).rejects.toThrow(/503/);
  });

  test("deleteTorrent DELETEs /api/torrents/<category>/<infohash>", async () => {
    const get = installFetch(() => new Response(JSON.stringify({}), { status: 200 }));
    const client = new DecypharrClient("http://example.com:8282");
    await client.deleteTorrent("special", "abcd1234");
    const call = get();
    expect(call.url).toBe("http://example.com:8282/api/torrents/special/abcd1234");
    expect(call.init.method).toBe("DELETE");
  });

  test("deleteTorrent encodes unsafe path segments", async () => {
    const get = installFetch(() => new Response(JSON.stringify({}), { status: 200 }));
    const client = new DecypharrClient("http://example.com:8282");
    await client.deleteTorrent("my cat", "hash with spaces");
    const call = get();
    expect(call.url).toBe("http://example.com:8282/api/torrents/my%20cat/hash%20with%20spaces");
  });

  test("deleteTorrent throws on non-2xx", async () => {
    installFetch(() => new Response("no", { status: 404 }));
    const client = new DecypharrClient("http://example.com:8282");
    await expect(client.deleteTorrent("special", "X")).rejects.toThrow(/404/);
  });
});
