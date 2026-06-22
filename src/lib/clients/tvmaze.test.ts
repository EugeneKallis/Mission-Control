/**
 * Unit tests for src/lib/clients/tvmaze.ts
 *
 * Covers:
 *  - isAnime returns true when "Anime" is in genres
 *  - isAnime returns true when type=Animation + country=Japan (network)
 *  - isAnime returns true when type=Animation + country=Japan (webChannel)
 *  - isAnime returns false for non-anime shows
 *  - isAnime returns false on 404
 *  - isAnime returns false on fetch error
 *  - isAnime returns false for tvdbId=0
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { isAnime } from "./tvmaze";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

function mockFetch(response: Response) {
  globalThis.fetch = mock(async () => response) as unknown as typeof fetch;
}

function mockFetchError() {
  globalThis.fetch = mock(async () => {
    throw new Error("network error");
  }) as unknown as typeof fetch;
}

describe("TVMaze isAnime", () => {
  test("returns true when 'Anime' is in genres", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          name: "Attack on Titan",
          type: "Animation",
          genres: ["Anime", "Action"],
          network: { country: { name: "Japan" } },
        }),
      ),
    );
    expect(await isAnime(12345)).toBe(true);
  });

  test("returns true when type=Animation + country=Japan via network", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          name: "Some Show",
          type: "Animation",
          genres: ["Comedy"],
          network: { country: { name: "Japan" } },
        }),
      ),
    );
    expect(await isAnime(12345)).toBe(true);
  });

  test("returns true when type=Animation + country=Japan via webChannel", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          name: "Some Show",
          type: "Animation",
          genres: ["Drama"],
          network: { country: { name: "United States" } },
          webChannel: { country: { name: "Japan" } },
        }),
      ),
    );
    expect(await isAnime(12345)).toBe(true);
  });

  test("returns false for non-anime show (Animation but not Japan)", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          name: "Avatar: The Last Airbender",
          type: "Animation",
          genres: ["Adventure"],
          network: { country: { name: "United States" } },
        }),
      ),
    );
    expect(await isAnime(12345)).toBe(false);
  });

  test("returns false for scripted non-anime show", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          name: "Breaking Bad",
          type: "Scripted",
          genres: ["Drama", "Crime"],
          network: { country: { name: "United States" } },
        }),
      ),
    );
    expect(await isAnime(12345)).toBe(false);
  });

  test("returns false on 404", async () => {
    mockFetch(new Response("Not Found", { status: 404 }));
    expect(await isAnime(12345)).toBe(false);
  });

  test("returns false on fetch error", async () => {
    mockFetchError();
    expect(await isAnime(12345)).toBe(false);
  });

  test("returns false for tvdbId=0", async () => {
    // Should not even call fetch
    let called = false;
    globalThis.fetch = mock(async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await isAnime(0)).toBe(false);
    expect(called).toBe(false);
  });

  test("returns false for negative tvdbId", async () => {
    expect(await isAnime(-1)).toBe(false);
  });
});
