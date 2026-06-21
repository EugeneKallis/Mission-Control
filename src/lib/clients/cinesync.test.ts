/**
 * Unit tests for src/lib/clients/cinesync.ts
 *
 * Covers:
 *  - login: posts username/password, returns token from `token` field
 *  - login: falls back to `access_token` field
 *  - login: returns empty string when both fields are missing
 *  - login: throws on non-2xx
 *  - getFiles: GETs /api/files with auth header
 *  - skipProcessing: POSTs { fileId } to /api/processing/skip
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { CineSyncClient } from "./cinesync";

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

describe("CineSyncClient", () => {
  test("login posts credentials and returns the `token` field", async () => {
    const calls = installFetch(() =>
      new Response(JSON.stringify({ token: "T" }))
    );
    const client = new CineSyncClient("http://files:5173", "http://auth:8082");
    const t = await client.login("alice", "pw");
    expect(t).toBe("T");
    expect(calls[0].url).toBe("http://auth:8082/api/login");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      username: "alice",
      password: "pw",
    });
  });

  test("login falls back to `access_token` when `token` is missing", async () => {
    installFetch(() =>
      new Response(JSON.stringify({ access_token: "AT" }))
    );
    const client = new CineSyncClient();
    expect(await client.login()).toBe("AT");
  });

  test("login returns empty string when both fields are missing", async () => {
    installFetch(() => new Response(JSON.stringify({})));
    const client = new CineSyncClient();
    expect(await client.login()).toBe("");
  });

  test("login throws on non-2xx", async () => {
    installFetch(() => new Response("nope", { status: 401 }));
    const client = new CineSyncClient();
    await expect(client.login()).rejects.toThrow(/401/);
  });

  test("login defaults to admin/admin", async () => {
    const calls = installFetch(() => new Response(JSON.stringify({ token: "T" })));
    const client = new CineSyncClient();
    await client.login();
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      username: "admin",
      password: "admin",
    });
  });

  test("getFiles GETs /api/files with auth", async () => {
    const calls = installFetch(() => new Response("[]"));
    const client = new CineSyncClient();
    const files = await client.getFiles("MY-TOK");
    expect(files).toEqual([]);
    expect(calls[0].url).toBe("http://192.168.1.102:5173/api/files");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer MY-TOK");
  });

  test("skipProcessing POSTs { fileId } to /api/processing/skip", async () => {
    const calls = installFetch(() => new Response("null"));
    const client = new CineSyncClient();
    await client.skipProcessing("MY-TOK", "file-1");
    expect(calls[0].url).toBe("http://192.168.1.102:8082/api/processing/skip");
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer MY-TOK");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ fileId: "file-1" });
  });

  test("skipProcessing throws on non-2xx", async () => {
    installFetch(() => new Response("nope", { status: 500 }));
    const client = new CineSyncClient();
    await expect(client.skipProcessing("X", "Y")).rejects.toThrow(/500/);
  });
});
