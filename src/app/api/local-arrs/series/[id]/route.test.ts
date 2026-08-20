import { afterEach, describe, expect, mock, test } from "bun:test";
import { deleteRequest, jsonBody, status } from "@/test-utils/route-helpers";

const mockResolveConfig = mock<() => Promise<unknown>>();
const mockDeleteSeries = mock<(id: number, deleteFiles: boolean) => Promise<unknown>>();

mock.module("@/lib/config", () => ({ resolveConfig: mockResolveConfig }));
mock.module("@/lib/clients/arr", () => ({
  ArrClient: mock(() => ({ deleteSeries: mockDeleteSeries })),
}));

const { DELETE } = await import("./route");

afterEach(() => {
  mockResolveConfig.mockReset();
  mockDeleteSeries.mockReset();
});

function configure() {
  mockResolveConfig.mockResolvedValue({
    arrInstances: [{ type: "sonarr", name: "SonarrLocal", url: "http://sonarr.local", apiKey: "key" }],
  });
}

describe("DELETE /api/local-arrs/series/:id", () => {
  test("deletes the series AND its files", async () => {
    configure();
    mockDeleteSeries.mockResolvedValue({});
    const res = await DELETE(deleteRequest("/api/local-arrs/series/42"), {
      params: Promise.resolve({ id: "42" }),
    });
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ seriesId: 42, deleted: true });
    expect(mockDeleteSeries).toHaveBeenCalledWith(42, true);
  });

  test("rejects a non-numeric id", async () => {
    configure();
    const res = await DELETE(deleteRequest("/api/local-arrs/series/xyz"), {
      params: Promise.resolve({ id: "xyz" }),
    });
    expect(status(res)).toBe(400);
  });

  test("rejects Radarr instance actions", async () => {
    configure();
    const res = await DELETE(deleteRequest("/api/local-arrs/series/42?instance=radarrlocal"), {
      params: Promise.resolve({ id: "42" }),
    });
    expect(status(res)).toBe(400);
  });

  test("returns 503 when the API key is missing", async () => {
    mockResolveConfig.mockResolvedValue({
      arrInstances: [{ type: "sonarr", name: "SonarrLocal", url: "http://sonarr.local", apiKey: "" }],
    });
    const res = await DELETE(deleteRequest("/api/local-arrs/series/42"), {
      params: Promise.resolve({ id: "42" }),
    });
    expect(status(res)).toBe(503);
  });

  test("maps an upstream Arr failure to 502", async () => {
    configure();
    mockDeleteSeries.mockRejectedValue(new Error("Arr API error (500)"));
    const res = await DELETE(deleteRequest("/api/local-arrs/series/42"), {
      params: Promise.resolve({ id: "42" }),
    });
    expect(status(res)).toBe(502);
  });
});