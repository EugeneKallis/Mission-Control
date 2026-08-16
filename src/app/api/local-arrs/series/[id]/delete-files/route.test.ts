import { afterEach, describe, expect, mock, test } from "bun:test";
import { jsonBody, jsonRequest, status } from "@/test-utils/route-helpers";

const mockResolveConfig = mock<() => Promise<unknown>>();
const mockListEpisodeFiles = mock<(seriesId: number) => Promise<unknown[]>>();
const mockBulkDeleteEpisodeFiles = mock<(ids: number[]) => Promise<unknown>>();

mock.module("@/lib/config", () => ({ resolveConfig: mockResolveConfig }));
mock.module("@/lib/clients/arr", () => ({
  ArrClient: mock(() => ({
    listEpisodeFiles: mockListEpisodeFiles,
    bulkDeleteEpisodeFiles: mockBulkDeleteEpisodeFiles,
  })),
}));

const { POST } = await import("./route");

afterEach(() => {
  mockResolveConfig.mockReset();
  mockListEpisodeFiles.mockReset();
  mockBulkDeleteEpisodeFiles.mockReset();
});

function configure() {
  mockResolveConfig.mockResolvedValue({
    arrInstances: [{ type: "sonarr", name: "SonarrLocal", url: "http://sonarr.local", apiKey: "key" }],
  });
}

describe("POST /api/local-arrs/series/:id/delete-files", () => {
  test("enumerates episode files then bulk-deletes them", async () => {
    configure();
    mockListEpisodeFiles.mockResolvedValue([{ id: 101 }, { id: 102 }, { id: 103 }]);
    mockBulkDeleteEpisodeFiles.mockResolvedValue({});

    const res = await POST(jsonRequest("/api/local-arrs/series/7/delete-files", {}), {
      params: Promise.resolve({ id: "7" }),
    });
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ seriesId: 7, deleted: 3 });
    expect(mockListEpisodeFiles).toHaveBeenCalledWith(7);
    expect(mockBulkDeleteEpisodeFiles).toHaveBeenCalledWith([101, 102, 103]);
  });

  test("reports zero deleted when there are no files", async () => {
    configure();
    mockListEpisodeFiles.mockResolvedValue([]);
    mockBulkDeleteEpisodeFiles.mockResolvedValue({});
    const res = await POST(jsonRequest("/api/local-arrs/series/7/delete-files", {}), {
      params: Promise.resolve({ id: "7" }),
    });
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ seriesId: 7, deleted: 0 });
    expect(mockBulkDeleteEpisodeFiles).toHaveBeenCalledWith([]);
  });

  test("rejects a non-numeric id", async () => {
    configure();
    const res = await POST(jsonRequest("/api/local-arrs/series/nope/delete-files", {}), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(status(res)).toBe(400);
  });

  test("rejects Radarr instance actions", async () => {
    configure();
    const res = await POST(jsonRequest("/api/local-arrs/series/7/delete-files?instance=radarrlocal", {}), {
      params: Promise.resolve({ id: "7" }),
    });
    expect(status(res)).toBe(400);
  });

  test("returns 503 when the API key is missing", async () => {
    mockResolveConfig.mockResolvedValue({
      arrInstances: [{ type: "sonarr", name: "SonarrLocal", url: "http://sonarr.local", apiKey: "" }],
    });
    const res = await POST(jsonRequest("/api/local-arrs/series/7/delete-files", {}), {
      params: Promise.resolve({ id: "7" }),
    });
    expect(status(res)).toBe(503);
  });

  test("maps an upstream Arr failure to 502", async () => {
    configure();
    mockListEpisodeFiles.mockRejectedValue(new Error("Arr API error (500)"));
    const res = await POST(jsonRequest("/api/local-arrs/series/7/delete-files", {}), {
      params: Promise.resolve({ id: "7" }),
    });
    expect(status(res)).toBe(502);
  });
});