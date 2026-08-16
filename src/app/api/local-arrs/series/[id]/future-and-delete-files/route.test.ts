import { afterEach, describe, expect, mock, test } from "bun:test";
import { jsonBody, jsonRequest, status } from "@/test-utils/route-helpers";

const mockResolveConfig = mock<() => Promise<unknown>>();
const mockSetSeriesMonitoring = mock<(id: number, monitor: string) => Promise<unknown>>();
const mockListEpisodeFiles = mock<(seriesId: number) => Promise<unknown[]>>();
const mockBulkDeleteEpisodeFiles = mock<(ids: number[]) => Promise<unknown>>();

mock.module("@/lib/config", () => ({ resolveConfig: mockResolveConfig }));
mock.module("@/lib/clients/arr", () => ({
  ArrClient: mock(() => ({
    setSeriesMonitoring: mockSetSeriesMonitoring,
    listEpisodeFiles: mockListEpisodeFiles,
    bulkDeleteEpisodeFiles: mockBulkDeleteEpisodeFiles,
  })),
}));

const { POST } = await import("./route");

afterEach(() => {
  mockResolveConfig.mockReset();
  mockSetSeriesMonitoring.mockReset();
  mockListEpisodeFiles.mockReset();
  mockBulkDeleteEpisodeFiles.mockReset();
});

function configure() {
  mockResolveConfig.mockResolvedValue({
    arrInstances: [{ type: "sonarr", name: "SonarrLocal", url: "http://sonarr.local", apiKey: "key" }],
  });
}

describe("POST /api/local-arrs/series/:id/future-and-delete-files", () => {
  test("sets Future first, then bulk-deletes all episode files", async () => {
    configure();
    const order: string[] = [];
    mockSetSeriesMonitoring.mockImplementation(async () => { order.push("monitor"); });
    mockListEpisodeFiles.mockImplementation(async () => { order.push("list"); return [{ id: 10 }, { id: 11 }]; });
    mockBulkDeleteEpisodeFiles.mockImplementation(async () => { order.push("delete"); });

    const res = await POST(jsonRequest("/api/local-arrs/series/74/future-and-delete-files", {}), {
      params: Promise.resolve({ id: "74" }),
    });

    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ seriesId: 74, monitor: "future", deleted: 2 });
    expect(order).toEqual(["monitor", "list", "delete"]);
    expect(mockSetSeriesMonitoring).toHaveBeenCalledWith(74, "future");
    expect(mockBulkDeleteEpisodeFiles).toHaveBeenCalledWith([10, 11]);
  });

  test("does not call bulk delete when there are no files", async () => {
    configure();
    mockSetSeriesMonitoring.mockResolvedValue({});
    mockListEpisodeFiles.mockResolvedValue([]);

    const res = await POST(jsonRequest("/api/local-arrs/series/74/future-and-delete-files", {}), {
      params: Promise.resolve({ id: "74" }),
    });

    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ seriesId: 74, monitor: "future", deleted: 0 });
    expect(mockBulkDeleteEpisodeFiles).not.toHaveBeenCalled();
  });

  test("does not list or delete files when monitoring fails", async () => {
    configure();
    mockSetSeriesMonitoring.mockRejectedValue(new Error("SeasonPass failed"));

    const res = await POST(jsonRequest("/api/local-arrs/series/74/future-and-delete-files", {}), {
      params: Promise.resolve({ id: "74" }),
    });

    expect(status(res)).toBe(502);
    expect(await jsonBody(res)).toEqual({ error: "Failed to set monitoring; files were not deleted" });
    expect(mockListEpisodeFiles).not.toHaveBeenCalled();
    expect(mockBulkDeleteEpisodeFiles).not.toHaveBeenCalled();
  });

  test("reports partial success when file deletion fails after monitoring changes", async () => {
    configure();
    mockSetSeriesMonitoring.mockResolvedValue({});
    mockListEpisodeFiles.mockResolvedValue([{ id: 10 }]);
    mockBulkDeleteEpisodeFiles.mockRejectedValue(new Error("delete failed"));

    const res = await POST(jsonRequest("/api/local-arrs/series/74/future-and-delete-files", {}), {
      params: Promise.resolve({ id: "74" }),
    });

    expect(status(res)).toBe(502);
    expect(await jsonBody(res)).toEqual({
      error: "Monitoring changed to future, but files could not be deleted",
      monitoringUpdated: true,
    });
  });

  test("rejects Radarr and malformed series ids", async () => {
    configure();
    const radarr = await POST(jsonRequest("/api/local-arrs/series/74/future-and-delete-files?instance=radarrlocal", {}), {
      params: Promise.resolve({ id: "74" }),
    });
    const malformed = await POST(jsonRequest("/api/local-arrs/series/74abc/future-and-delete-files", {}), {
      params: Promise.resolve({ id: "74abc" }),
    });

    expect(status(radarr)).toBe(400);
    expect(status(malformed)).toBe(400);
  });
});
