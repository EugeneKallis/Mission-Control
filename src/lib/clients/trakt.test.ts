/**
 * Unit tests for src/lib/clients/trakt.ts
 *
 * Covers:
 *  - getWatchedShows: trakt headers + Authorization override
 *  - deviceCode: POST with client_id only
 *  - pollDeviceToken: throws 'PENDING' on authorization_pending,
 *    returns token payload on success
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { TraktClient } from "./trakt";

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

describe("TraktClient", () => {
  test("getWatchedShows sends trakt headers + Authorization", async () => {
    const calls = installFetch(() => new Response("[]"));
    const client = new TraktClient("CID", "SECRET");
    await client.getWatchedShows("USER-TOK");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["trakt-api-version"]).toBe("2");
    expect(headers["trakt-api-key"]).toBe("CID");
    expect(headers.Authorization).toBe("Bearer USER-TOK");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(calls[0].url).toBe("https://api.trakt.tv/sync/watched/shows");
  });

  test("getWatchedShows throws on non-2xx with status in the message", async () => {
    installFetch(() => new Response("nope", { status: 500 }));
    const client = new TraktClient("CID", "SECRET");
    await expect(client.getWatchedShows("X")).rejects.toThrow(/500/);
  });

  test("deviceCode POSTs with client_id only", async () => {
    const calls = installFetch(() =>
      new Response(
        JSON.stringify({
          device_code: "DC",
          user_code: "UC",
          verification_url: "https://trakt.tv/activate",
          expires_in: 600,
          interval: 5,
        })
      )
    );
    const client = new TraktClient("CID", "SECRET");
    const res = await client.deviceCode();
    expect(res.device_code).toBe("DC");
    expect(calls[0].url).toBe("https://api.trakt.tv/oauth/device");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ client_id: "CID" });
  });

  test("pollDeviceToken returns the token on success", async () => {
    const calls = installFetch(() =>
      new Response(
        JSON.stringify({
          access_token: "AT",
          refresh_token: "RT",
          created_at: 1,
        })
      )
    );
    const client = new TraktClient("CID", "SECRET");
    const res = await client.pollDeviceToken("DC");
    expect(res.access_token).toBe("AT");
    expect(calls[0].url).toBe("https://api.trakt.tv/oauth/device/token");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      code: "DC",
      client_id: "CID",
      client_secret: "SECRET",
    });
  });

  test("pollDeviceToken throws 'PENDING' on authorization_pending", async () => {
    installFetch(() =>
      new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 })
    );
    const client = new TraktClient("CID", "SECRET");
    await expect(client.pollDeviceToken("DC")).rejects.toThrow("PENDING");
  });
});
