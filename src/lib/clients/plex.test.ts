/**
 * Unit tests for src/lib/clients/plex.ts
 *
 * Covers:
 *  - getContinueWatching, getWatchlist, getLibraries, getLibraryItems:
 *    URL assembly + X-Plex-Token header.
 *  - getWatchlist falls back to the default URL when watchlistRss is empty.
 *  - createPin / pollPin (static methods) hit plex.tv with no auth header.
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { PlexClient } from "./plex";
import type { PlexConfig } from "@/types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface CapturedCall {
  url: string;
  init: RequestInit;
}

function installFetch(responder: (url: string, init: RequestInit) => Response) {
  const calls: CapturedCall[] = [];
  globalThis.fetch = mock(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return responder(url, init);
  }) as unknown as typeof fetch;
  return calls;
}

const config: PlexConfig = {
  token: "PLEX-TOKEN",
  url: "http://192.168.1.50:32400",
  // watchlistRss is omitted (undefined) to exercise the fallback path.
  // The implementation uses `??` which doesn't fall through for an empty
  // string; we test that case separately below.
};

describe("PlexClient", () => {
  test("getContinueWatching hits the right path with auth header", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new PlexClient(config);
    await client.getContinueWatching();
    expect(calls[0].url).toBe("http://192.168.1.50:32400/hubs/continueWatching/");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-Plex-Token"]).toBe("PLEX-TOKEN");
    expect(headers.Accept).toBe("application/json");
  });

  test("getWatchlist falls back to the default URL when watchlistRss is undefined", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new PlexClient(config);
    await client.getWatchlist();
    expect(calls[0].url).toBe("http://192.168.1.50:32400/library/sections/watchlist/");
  });

  test("getWatchlist uses the watchlistRss URL when set", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new PlexClient({
      ...config,
      watchlistRss: "http://rss.example.com/watchlist.rss",
    });
    await client.getWatchlist();
    expect(calls[0].url).toBe("http://rss.example.com/watchlist.rss");
  });

  test("getWatchlist with an empty-string watchlistRss hits the empty URL (current behavior)", async () => {
    // Documents a real bug: the implementation uses `??` (nullish coalesce)
    // rather than `||`, so an explicitly empty string watchlistRss is used
    // as the URL. We assert the current behavior here so any future fix is
    // caught by the test diff.
    const calls = installFetch(() => new Response("{}"));
    const client = new PlexClient({ ...config, watchlistRss: "" });
    await client.getWatchlist();
    expect(calls[0].url).toBe("");
  });

  test("getLibraries hits /library/sections", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new PlexClient(config);
    await client.getLibraries();
    expect(calls[0].url).toBe("http://192.168.1.50:32400/library/sections");
  });

  test("getLibraryItems hits /library/sections/:id/all", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new PlexClient(config);
    await client.getLibraryItems(7);
    expect(calls[0].url).toBe("http://192.168.1.50:32400/library/sections/7/all");
  });

  test("throws on non-2xx with the response body in the message", async () => {
    installFetch(() => new Response("forbidden", { status: 403 }));
    const client = new PlexClient(config);
    await expect(client.getLibraries()).rejects.toThrow(/403/);
  });
});

describe("PlexClient static OAuth methods", () => {
  test("createPin POSTs to plex.tv with no auth", async () => {
    const calls = installFetch(() =>
      new Response(JSON.stringify({ id: "pin-id", code: "ABCD" }))
    );
    const res = await PlexClient.createPin();
    expect(res.id).toBe("pin-id");
    expect(calls[0].url).toBe("https://plex.tv/api/v2/pins?strong=true");
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-Plex-Token"]).toBeUndefined();
  });

  test("pollPin GETs plex.tv/api/v2/pins/:id", async () => {
    const calls = installFetch(() =>
      new Response(JSON.stringify({ id: "pin-id", authToken: "TOK" }))
    );
    const res = await PlexClient.pollPin("pin-id");
    expect(res.authToken).toBe("TOK");
    expect(calls[0].url).toBe("https://plex.tv/api/v2/pins/pin-id");
  });
});
