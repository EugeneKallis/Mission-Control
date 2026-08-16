import { afterEach, describe, expect, mock, test } from "bun:test";
import { getRequest } from "@/test-utils/route-helpers";

const mockResolveConfig = mock<() => Promise<unknown>>();
const mockListSeries = mock<() => Promise<unknown[]>>();
const mockListMovies = mock<() => Promise<unknown[]>>();

mock.module("@/lib/config", () => ({ resolveConfig: mockResolveConfig }));
mock.module("@/lib/clients/arr", () => ({
  ArrClient: mock(() => ({
    listSeries: mockListSeries,
    listMovies: mockListMovies,
  })),
}));

const { GET } = await import("./route");

const instances = [
  { type: "sonarr" as const, name: "SonarrLocal", url: "http://sonarr.local:8993/", apiKey: "sonarr-key" },
  { type: "radarr" as const, name: "RadarrLocal", url: "http://radarr.local:7878", apiKey: "radarr-key" },
];

function configure(overrides: Record<string, unknown> = {}) {
  mockResolveConfig.mockResolvedValue({ arrInstances: instances, ...overrides });
}

afterEach(() => {
  mockResolveConfig.mockReset();
  mockListSeries.mockReset();
  mockListMovies.mockReset();
});

describe("GET /api/local-arrs/library", () => {
  test("returns normalized Sonarr series and whole-library totals", async () => {
    configure();
    mockListSeries.mockResolvedValue([
      {
        id: 1,
        title: "The Expanse",
        titleSlug: "the-expanse",
        statistics: { sizeOnDisk: 10_000, episodeFileCount: 20 },
      },
      {
        id: 2,
        title: "Empty Show",
        titleSlug: "empty-show",
        statistics: { sizeOnDisk: 0, episodeFileCount: 0 },
      },
    ]);

    const response = await GET(getRequest("/api/local-arrs/library"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.totalItems).toBe(2);
    expect(body.totalSize).toBe(10_000);
    expect(body.items[0]).toEqual({
      id: 1,
      title: "The Expanse",
      sizeOnDisk: 10_000,
      fileCount: 20,
      href: "http://sonarr.local:8993/series/the-expanse",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("returns normalized Radarr movies and uses the configured URL", async () => {
    configure();
    mockListMovies.mockResolvedValue([
      {
        id: 4,
        title: "A Movie",
        titleSlug: "a-movie",
        hasFile: true,
        sizeOnDisk: 123,
        statistics: { movieFileCount: 1, sizeOnDisk: 456 },
      },
      {
        id: 5,
        title: "No File",
        titleSlug: "no-file",
        hasFile: false,
      },
    ]);

    const response = await GET(getRequest("/api/local-arrs/library?instance=radarrlocal"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.label).toBe("Radarr Local");
    expect(body.items).toEqual([
      { id: 4, title: "A Movie", sizeOnDisk: 456, fileCount: 1, href: "http://radarr.local:7878/movie/a-movie" },
      { id: 5, title: "No File", sizeOnDisk: 0, fileCount: 0, href: "http://radarr.local:7878/movie/no-file" },
    ]);
  });

  test("rejects unsupported instances", async () => {
    const response = await GET(getRequest("/api/local-arrs/library?instance=sonarr"));
    expect(response.status).toBe(400);
  });

  test("rejects prototype-chain keys the `in` operator would have accepted", async () => {
    // Before the Object.hasOwn fix, ?instance=toString passed the slug guard
    // ("toString" in LOCAL_ARRS is true via the prototype chain) and degraded
    // into a 503 with an "undefined is not configured" message.
    const response = await GET(getRequest("/api/local-arrs/library?instance=toString"));
    expect(response.status).toBe(400);
  });

  test("returns a configuration error when the API key is missing", async () => {
    configure({
      arrInstances: [{ ...instances[0], apiKey: "" }, instances[1]],
    });

    const response = await GET(getRequest("/api/local-arrs/library"));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("No API key");
  });

  test("turns Arr failures into a safe upstream error", async () => {
    configure();
    mockListSeries.mockRejectedValue(new Error("Arr API error (502)"));

    const response = await GET(getRequest("/api/local-arrs/library"));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("Failed to load Sonarr Local");
  });
});
