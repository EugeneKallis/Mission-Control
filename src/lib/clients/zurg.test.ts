import { afterEach, describe, expect, test } from "bun:test";
import { ZurgClient } from "./zurg";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("ZurgClient", () => {
  test("adds magnets with bearer auth and category", async () => {
    let request: Request | undefined;
    globalThis.fetch = (async (input, init) => { request = new Request(input, init); return new Response("Ok."); }) as typeof fetch;
    await new ZurgClient("http://zurg/", "secret").addMagnet("magnet:?xt=x");
    expect(request?.url).toBe("http://zurg/api/v2/torrents/add");
    expect(request?.headers.get("Authorization")).toBe("Bearer secret");
    const body = await request!.text();
    expect(body).toContain("urls=magnet");
    expect(body).toContain("category=special");
  });

  test("uploads torrent bytes using torrents field", async () => {
    let form: FormData | undefined;
    globalThis.fetch = (async (_input, init) => { form = init?.body as FormData; return new Response("Ok."); }) as typeof fetch;
    await new ZurgClient("http://zurg", "secret").addTorrent(new TextEncoder().encode("torrent").buffer, "x.torrent");
    expect(form?.get("torrents")).toBeInstanceOf(Blob);
    expect(form?.get("category")).toBe("special");
    expect(form?.get("deleteFiles")).toBeNull();
  });

  test("lists category-filtered torrents and removes by hash without deleting files", async () => {
    const calls: Request[] = [];
    globalThis.fetch = (async (input, init) => {
      calls.push(new Request(input, init));
      return new Response(JSON.stringify([{
        hash: "abc",
        name: "x",
        category: "special",
        state: "pausedUP",
        content_path: "/all/x",
        unconsumed: "not exposed",
      }]));
    }) as typeof fetch;
    const client = new ZurgClient("http://zurg", "secret");
    expect(await client.listTorrents()).toEqual([{
      hash: "abc",
      name: "x",
      category: "special",
      state: "pausedUP",
      content_path: "/all/x",
    }]);
    expect(calls[0]?.url).toBe("http://zurg/api/v2/torrents/info?category=special");
    expect(calls[0]?.headers.get("Authorization")).toBe("Bearer secret");
    await client.removeTorrent("abc");
    expect(calls[1]?.url).toBe("http://zurg/api/v2/torrents/delete");
    expect(await calls[1]?.text()).toBe("hashes=abc");
    expect(calls[1]?.headers.get("Authorization")).toBe("Bearer secret");
  });

  test("rejects missing key, failures, and non-2xx", async () => {
    await expect(new ZurgClient("http://zurg").addMagnet("magnet:x")).rejects.toThrow(/API key/);
    globalThis.fetch = (async () => new Response("Fails.")) as unknown as typeof fetch;
    await expect(new ZurgClient("http://zurg", "secret").addMagnet("magnet:x")).rejects.toThrow(/rejected/);
    globalThis.fetch = (async () => new Response("bad", { status: 500 })) as unknown as typeof fetch;
    await expect(new ZurgClient("http://zurg", "secret").addMagnet("magnet:x")).rejects.toThrow(/500/);
  });
});
