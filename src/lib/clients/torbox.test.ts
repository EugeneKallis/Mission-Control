/**
 * Unit tests for src/lib/clients/torbox.ts
 *
 * Covers:
 *  - extractHashFromMagnet: pure parser, edge cases
 *  - checkCached: success / API error / !success / empty result
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { TorboxClient } from "./torbox";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("TorboxClient.extractHashFromMagnet", () => {
  test("extracts a 40-char hex hash", () => {
    expect(
      TorboxClient.extractHashFromMagnet(
        "magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=foo",
      )
    ).toBe("dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c");
  });

  test("extracts a 32-char base32 hash", () => {
    expect(
      TorboxClient.extractHashFromMagnet(
        "magnet:?xt=urn:btih:ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
      )
    ).toBe("abcdefghijklmnopqrstuvwxyz234567");
  });

  test("returns empty string for a magnet without 'urn:btih:'", () => {
    expect(TorboxClient.extractHashFromMagnet("magnet:?dn=foo")).toBe("");
  });

  test("returns empty string for non-magnet input", () => {
    expect(TorboxClient.extractHashFromMagnet("https://example.com")).toBe("");
    expect(TorboxClient.extractHashFromMagnet("")).toBe("");
  });

  test("stops at the first '&' or '?' after the hash", () => {
    expect(
      TorboxClient.extractHashFromMagnet(
        "magnet:?xt=urn:btih:DEADBEEF&tr=udp%3A%2F%2Ftracker.example.com",
      )
    ).toBe("deadbeef");
  });

  test("lowercases the returned hash", () => {
    expect(
      TorboxClient.extractHashFromMagnet("magnet:?xt=urn:btih:ABCDEF&dn=x")
    ).toBe("abcdef");
  });
});

describe("TorboxClient.checkCached", () => {
  test("returns a map with hashes set to true when present in data", async () => {
    const apiResponse = {
      success: true,
      data: {
        dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c: {
          name: "cached-file",
          size: 1234,
          hash: "dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c",
        },
      },
    };
    globalThis.fetch = mock(async () => new Response(JSON.stringify(apiResponse), { status: 200 })) as unknown as typeof fetch;

    const client = new TorboxClient("test-key");
    const result = await client.checkCached(["dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c"]);
    expect(result.get("dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c")).toBe(true);
  });

  test("marks hashes not in the data as false", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })
    ) as unknown as typeof fetch;

    const client = new TorboxClient("test-key");
    const result = await client.checkCached(["aaaa", "bbbb"]);
    expect(result.get("aaaa")).toBe(false);
    expect(result.get("bbbb")).toBe(false);
  });

  test("throws on non-2xx response", async () => {
    globalThis.fetch = mock(async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
    const client = new TorboxClient("test-key");
    await expect(client.checkCached(["x"])).rejects.toThrow(/429/);
  });

  test("throws when success=false", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({ success: false, detail: "Bad API key" }),
        { status: 200 },
      )
    ) as unknown as typeof fetch;
    const client = new TorboxClient("bad-key");
    await expect(client.checkCached(["x"])).rejects.toThrow(/Bad API key/);
  });

  test("uses Bearer auth + JSON body", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      captured = { url, init: init ?? {} };
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = new TorboxClient("MY-KEY");
    await client.checkCached(["a", "b"]);
    expect(captured!.url).toBe("https://api.torbox.app/v1/api/torrents/checkcached");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer MY-KEY");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(captured!.init.body as string)).toEqual({ hashes: ["a", "b"] });
  });
});
