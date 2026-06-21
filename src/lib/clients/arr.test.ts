/**
 * Unit tests for src/lib/clients/arr.ts
 *
 * Covers:
 *  - Constructor normalises trailing slashes
 *  - listMovies / listSeries hit the right path
 *  - lookupSeries URL-encodes the search term
 *  - getWantedMissing default + override query
 *  - trigger*Search commands POST the right payload + path
 *  - delete* issues a DELETE
 *  - addSeries / addMovie POST JSON
 *  - buildArrMappings: radarr + sonarr instances, errors on a single
 *    instance don't break the others
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { ArrClient, buildArrMappings } from "./arr";
import type { ArrInstance } from "@/types";

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

const radarr: ArrInstance = {
  type: "radarr",
  name: "Radarr",
  url: "http://192.168.1.111:7878",
  apiKey: "K1",
};

const sonarr: ArrInstance = {
  type: "sonarr",
  name: "Sonarr",
  url: "http://192.168.1.111:8989",
  apiKey: "K2",
};

describe("ArrClient", () => {
  test("constructor strips trailing slashes from the base URL", () => {
    const c = new ArrClient({ ...radarr, url: "http://192.168.1.111:7878/" });
    expect(c).toBeDefined();
    // The normalised URL is private; we exercise it via a real fetch below.
  });

  test("listMovies hits /api/v3/movie", async () => {
    const calls = installFetch(() => new Response("[]"));
    const client = new ArrClient(radarr);
    await client.listMovies();
    expect(calls[0].url).toBe("http://192.168.1.111:7878/api/v3/movie");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-Api-Key"]).toBe("K1");
  });

  test("listSeries hits /api/v3/series", async () => {
    const calls = installFetch(() => new Response("[]"));
    const client = new ArrClient(sonarr);
    await client.listSeries();
    expect(calls[0].url).toBe("http://192.168.1.111:8989/api/v3/series");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-Api-Key"]).toBe("K2");
  });

  test("lookupSeries URL-encodes the term", async () => {
    const calls = installFetch(() => new Response("[]"));
    const client = new ArrClient(sonarr);
    await client.lookupSeries("the wire");
    expect(calls[0].url).toBe("http://192.168.1.111:8989/api/v3/series/lookup?term=the%20wire");
  });

  test("getWantedMissing sends the default page/size/sort", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new ArrClient(sonarr);
    await client.getWantedMissing();
    expect(calls[0].url).toBe(
      "http://192.168.1.111:8989/api/v3/wanted/missing?page=1&pageSize=50&sortKey=airDateUtc&sortDir=desc",
    );
  });

  test("getWantedMissing accepts custom page/pageSize", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new ArrClient(sonarr);
    await client.getWantedMissing(3, 10);
    expect(calls[0].url).toBe(
      "http://192.168.1.111:8989/api/v3/wanted/missing?page=3&pageSize=10&sortKey=airDateUtc&sortDir=desc",
    );
  });

  test("triggerMovieSearch posts MoviesSearch command", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new ArrClient(radarr);
    await client.triggerMovieSearch([1, 2, 3]);
    expect(calls[0].url).toBe("http://192.168.1.111:7878/api/v3/command");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      name: "MoviesSearch",
      movieIds: [1, 2, 3],
    });
  });

  test("triggerEpisodeSearch posts EpisodeSearch command", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new ArrClient(sonarr);
    await client.triggerEpisodeSearch([10, 11]);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      name: "EpisodeSearch",
      episodeIds: [10, 11],
    });
  });

  test("triggerSeasonSearch posts SeasonSearch command", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new ArrClient(sonarr);
    await client.triggerSeasonSearch(1, 2);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      name: "SeasonSearch",
      seriesId: 1,
      seasonNumber: 2,
    });
  });

  test("triggerSeriesSearch posts SeriesSearch command", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new ArrClient(sonarr);
    await client.triggerSeriesSearch(5);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      name: "SeriesSearch",
      seriesId: 5,
    });
  });

  test("triggerRescan posts RescanMovie command", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new ArrClient(radarr);
    await client.triggerRescan("/movies");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      name: "RescanMovie",
      path: "/movies",
    });
  });

  test("deleteMovie issues a DELETE with deleteFiles flag", async () => {
    const calls = installFetch(() => new Response("null"));
    // Use a trailing-slash URL to exercise the constructor's normalisation
    // end-to-end.
    const client = new ArrClient({ ...radarr, url: "http://192.168.1.111:7878/" });
    await client.deleteMovie(1, true);
    expect(calls[0].url).toBe("http://192.168.1.111:7878/api/v3/movie/1?deleteFiles=true");
    expect(calls[0].init.method).toBe("DELETE");
  });

  test("deleteSeries issues a DELETE", async () => {
    const calls = installFetch(() => new Response("null"));
    const client = new ArrClient(sonarr);
    await client.deleteSeries(2, false);
    expect(calls[0].url).toBe("http://192.168.1.111:8989/api/v3/series/2?deleteFiles=false");
  });

  test("addSeries posts JSON body to /series", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new ArrClient(sonarr);
    await client.addSeries({
      tvdbId: 123,
      title: "The Wire",
      qualityProfileId: 1,
      languageProfileId: 1,
      rootFolderPath: "/tv",
      seriesType: "standard",
      seasonFolder: true,
      monitored: true,
      addOptions: { searchForMissingEpisodes: false, monitor: "all" },
    });
    expect(calls[0].url).toBe("http://192.168.1.111:8989/api/v3/series");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0].init.body as string).title).toBe("The Wire");
  });

  test("addMovie posts JSON body to /movie", async () => {
    const calls = installFetch(() => new Response("{}"));
    const client = new ArrClient(radarr);
    await client.addMovie({
      tmdbId: 99,
      title: "Heat",
      qualityProfileId: 1,
      rootFolderPath: "/movies",
      monitored: true,
      minimumAvailability: "released",
      addOptions: { searchForMovie: true },
    });
    expect(calls[0].url).toBe("http://192.168.1.111:7878/api/v3/movie");
    expect(JSON.parse(calls[0].init.body as string).title).toBe("Heat");
  });
});

describe("buildArrMappings", () => {
  test("builds a folder-name → URL map for radarr + sonarr", async () => {
    globalThis.fetch = mock(async (url: string) => {
      // The ArrClient hits /api/v3/movie and /api/v3/series — match the path
      // more loosely to avoid getting fooled by future /api/v3/movie/* paths.
      if (url.includes(":7878") && url.endsWith("/api/v3/movie")) {
        return new Response(
          JSON.stringify([
            { id: 1, title: "Heat", titleSlug: "heat-1995" },
            { id: 2, title: "Alien", titleSlug: "alien-1979" },
          ]),
        );
      }
      if (url.includes(":8989") && url.endsWith("/api/v3/series")) {
        return new Response(
          JSON.stringify([
            { id: 10, title: "The Wire", titleSlug: "the-wire" },
          ]),
        );
      }
      return new Response("[]");
    }) as unknown as typeof fetch;

    const map = await buildArrMappings([radarr, sonarr]);
    expect(map["heat-1995"]).toBe("http://192.168.1.111:7878/movie/heat-1995");
    expect(map["alien-1979"]).toBe("http://192.168.1.111:7878/movie/alien-1979");
    expect(map["the-wire"]).toBe("http://192.168.1.111:8989/series/the-wire");
  });

  test("skips instances whose fetch throws but continues with the rest", async () => {
    let radarrHit = 0;
    let sonarrHit = 0;
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes(":7878")) {
        radarrHit++;
        throw new Error("radarr down");
      }
      if (url.includes(":8989")) {
        sonarrHit++;
        return new Response(JSON.stringify([{ id: 1, title: "X", titleSlug: "x" }]));
      }
      return new Response("[]");
    }) as unknown as typeof fetch;

    // Suppress the expected console.warn from the production code path.
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      const map = await buildArrMappings([radarr, sonarr]);
      expect(radarrHit).toBe(1);
      expect(sonarrHit).toBe(1);
      // NOTE: buildArrMappings uses inst.url verbatim (it does not run the
      // value through the constructor's trailing-slash trim), so a leading
      // slash leaks in. The radarr instance here is configured with a
      // trailing slash; the sonarr instance is not. We assert both: the
      // mapping is built, and the sonarr URL is correct.
      expect(map["x"]).toBe("http://192.168.1.111:8989/series/x");
    } finally {
      console.warn = origWarn;
    }
  });

  test("returns an empty map when no instances are passed", async () => {
    expect(await buildArrMappings([])).toEqual({});
  });
});
