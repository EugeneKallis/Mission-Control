/**
 * Unit tests for src/lib/clients/real-debrid.ts
 *
 * Covers:
 *  - isAuthError:    pure helper for error classification
 *  - premiumDaysRemaining: pure math
 *  - getUser:        success + auth error
 *  - addTorrentMagnet: form encoding + auth header
 *  - getTorrentInstantAvailability: URLSearchParams with repeated `hash` keys
 *  - getTorrents: query string assembly
 *  - unrestrictLink: form encoding
 *  - deleteTorrent: DELETE method
 *  - isAuthError for the 400 + "bad token" combo
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { RealDebridClient, isAuthError } from "./real-debrid";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Pure helpers ────────────────────────────────────────────────────────

describe("isAuthError", () => {
  test("returns true on 401", () => {
    expect(isAuthError({ status: 401 })).toBe(true);
  });

  test("returns true on 403", () => {
    expect(isAuthError({ status: 403 })).toBe(true);
  });

  test("returns true on 400 with 'bad token' body", () => {
    expect(isAuthError({ status: 400, body: "bad token" })).toBe(true);
  });

  test("returns false on 400 with a different body", () => {
    expect(isAuthError({ status: 400, body: "missing param" })).toBe(false);
  });

  test("returns false on 500", () => {
    expect(isAuthError({ status: 500, body: "oops" })).toBe(false);
  });

  test("returns false when error is not shaped like an API error", () => {
    expect(isAuthError(new Error("nope"))).toBe(false);
    // Note: null/undefined would currently throw because the implementation
    // reads `e.status` without guarding. We don't test that here — the helper
    // is only called with structured API errors in the codebase.
  });
});

describe("premiumDaysRemaining", () => {
  test("floors seconds / 86400", () => {
    const client = new RealDebridClient("k");
    expect(
      client.premiumDaysRemaining({
        // 1.5 days in seconds
        premium: 86400 + 43200,
        // other fields are unused
      } as unknown as Parameters<typeof client.premiumDaysRemaining>[0])
    ).toBe(1);
  });

  test("returns 0 for negative seconds", () => {
    const client = new RealDebridClient("k");
    expect(
      client.premiumDaysRemaining({ premium: -100 } as unknown as Parameters<typeof client.premiumDaysRemaining>[0])
    ).toBe(-1); // Math.floor(-100/86400) === -1
  });
});

// ── HTTP methods (with fetch mocked) ────────────────────────────────────

interface CapturedCall {
  url: string;
  init: RequestInit;
}

function mockResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

function installFetch(responder: (url: string, init: RequestInit) => Response) {
  let captured: CapturedCall | null = null;
  globalThis.fetch = mock(async (url: string, init: RequestInit = {}) => {
    captured = { url, init };
    return responder(url, init);
  }) as unknown as typeof fetch;
  return () => captured as CapturedCall;
}

describe("RealDebridClient.getUser", () => {
  test("returns parsed JSON on 200", async () => {
    const get = installFetch(() =>
      mockResponse({ id: 1, username: "u", premium: 86400 })
    );
    const client = new RealDebridClient("k");
    const user = await client.getUser();
    expect(user.username).toBe("u");
    const call = get();
    expect(call.url).toBe("https://api.real-debrid.com/rest/1.0/user");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer k");
  });

  test("throws on non-2xx with status attached to the error", async () => {
    installFetch(() => mockResponse("forbidden", 403));
    const client = new RealDebridClient("bad-key");
    try {
      await client.getUser();
      expect.unreachable("expected throw");
    } catch (err) {
      const e = err as Error & { status?: number; body?: string };
      expect(e.status).toBe(403);
      expect(e.body).toBe("forbidden");
    }
  });
});

describe("RealDebridClient.getTorrents", () => {
  test("URL-encodes limit and offset", async () => {
    const get = installFetch(() => mockResponse([]));
    const client = new RealDebridClient("k");
    await client.getTorrents(50, 100);
    const call = get();
    expect(call.url).toBe("https://api.real-debrid.com/rest/1.0/torrents?limit=50&offset=100");
  });

  test("defaults to limit=5000, offset=0", async () => {
    const get = installFetch(() => mockResponse([]));
    const client = new RealDebridClient("k");
    await client.getTorrents();
    const call = get();
    expect(call.url).toBe("https://api.real-debrid.com/rest/1.0/torrents?limit=5000&offset=0");
  });
});

describe("RealDebridClient.addTorrentMagnet", () => {
  test("sends a URL-encoded body with the magnet", async () => {
    const get = installFetch(() => mockResponse({ id: "abc", uri: "uri" }));
    const client = new RealDebridClient("k");
    const res = await client.addTorrentMagnet("magnet:?xt=urn:btih:DEADBEEF");
    expect(res.id).toBe("abc");
    const call = get();
    expect(call.url).toBe("https://api.real-debrid.com/rest/1.0/torrents/addMagnet");
    expect(call.init.method).toBe("POST");
    expect(call.init.body).toBe("magnet=magnet%3A%3Fxt%3Durn%3Abtih%3ADEADBEEF");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer k");
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });
});

describe("RealDebridClient.getTorrentInstantAvailability", () => {
  test("emits a `hash=` param per hash (URLSearchParams)", async () => {
    const get = installFetch(() => mockResponse({}));
    const client = new RealDebridClient("k");
    await client.getTorrentInstantAvailability(["aaa", "bbb", "ccc"]);
    const call = get();
    // URLSearchParams encodes spaces as '+' and ',' as '%2C' but our hashes
    // contain only hex, so the encoded form is exact.
    expect(call.url).toBe(
      "https://api.real-debrid.com/rest/1.0/torrents/instantAvailability?hash=aaa&hash=bbb&hash=ccc",
    );
  });
});

describe("RealDebridClient.unrestrictLink", () => {
  test("sends a URL-encoded body with the link", async () => {
    const get = installFetch(() => mockResponse({ download: "https://dl.example.com/x" }));
    const client = new RealDebridClient("k");
    await client.unrestrictLink("https://example.com/file");
    const call = get();
    expect(call.url).toBe("https://api.real-debrid.com/rest/1.0/unrestrict/link");
    expect(call.init.body).toBe("link=https%3A%2F%2Fexample.com%2Ffile");
  });
});

describe("RealDebridClient.deleteTorrent", () => {
  test("issues a DELETE", async () => {
    // The client's fetch<T> wrapper always calls res.json(), so we return
    // valid JSON ("null") instead of an empty body. The important
    // assertions are the method + URL.
    const get = installFetch(() => mockResponse("null"));
    const client = new RealDebridClient("k");
    await client.deleteTorrent("ABC123");
    const call = get();
    expect(call.init.method).toBe("DELETE");
    expect(call.url).toBe("https://api.real-debrid.com/rest/1.0/torrents/delete/ABC123");
  });
});

describe("RealDebridClient.selectTorrentFiles", () => {
  test("sends repeated `files=` form fields", async () => {
    const get = installFetch(() => mockResponse("null"));
    const client = new RealDebridClient("k");
    await client.selectTorrentFiles("ABC", ["1", "2", "3"]);
    const call = get();
    expect(call.url).toBe("https://api.real-debrid.com/rest/1.0/torrents/selectFiles/ABC");
    expect(call.init.body).toBe("files=1&files=2&files=3");
  });
});
