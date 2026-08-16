import { afterEach, describe, expect, mock, test } from "bun:test";
import { deleteRequest, getRequest, jsonBody, jsonRequest, status } from "@/test-utils/route-helpers";

const mockResolveConfig = mock<() => Promise<unknown>>();
const mockSetSeriesMonitoring = mock<(id: number, monitor: string) => Promise<unknown>>();

mock.module("@/lib/config", () => ({ resolveConfig: mockResolveConfig }));
mock.module("@/lib/clients/arr", () => ({
  ArrClient: mock(() => ({ setSeriesMonitoring: mockSetSeriesMonitoring })),
  SonarrMonitorType: undefined,
}));

const { POST } = await import("./route");

afterEach(() => {
  mockResolveConfig.mockReset();
  mockSetSeriesMonitoring.mockReset();
});

function configure() {
  mockResolveConfig.mockResolvedValue({
    arrInstances: [
      { type: "sonarr", name: "SonarrLocal", url: "http://sonarr.local", apiKey: "key" },
    ],
  });
}

describe("POST /api/local-arrs/series/:id/monitor", () => {
  test("applies a valid monitor option via SeasonPass", async () => {
    configure();
    mockSetSeriesMonitoring.mockResolvedValue({});
    const res = await POST(
      jsonRequest("/api/local-arrs/series/12/monitor", { monitor: "future" }),
      { params: Promise.resolve({ id: "12" }) },
    );
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ seriesId: 12, monitor: "future" });
    expect(mockSetSeriesMonitoring).toHaveBeenCalledWith(12, "future");
  });

  test("rejects an unsupported monitor value", async () => {
    configure();
    const res = await POST(
      jsonRequest("/api/local-arrs/series/12/monitor", { monitor: "allEpisodes" }),
      { params: Promise.resolve({ id: "12" }) },
    );
    expect(status(res)).toBe(400);
  });

  test("rejects a non-numeric id", async () => {
    configure();
    const res = await POST(
      jsonRequest("/api/local-arrs/series/abc/monitor", { monitor: "future" }),
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(status(res)).toBe(400);
  });

  test("rejects Radarr instance actions", async () => {
    configure();
    const res = await POST(
      jsonRequest("/api/local-arrs/series/12/monitor?instance=radarrlocal", { monitor: "future" }),
      { params: Promise.resolve({ id: "12" }) },
    );
    expect(status(res)).toBe(400);
  });

  test("returns 503 when the API key is missing", async () => {
    mockResolveConfig.mockResolvedValue({
      arrInstances: [{ type: "sonarr", name: "SonarrLocal", url: "http://sonarr.local", apiKey: "" }],
    });
    const res = await POST(
      jsonRequest("/api/local-arrs/series/12/monitor", { monitor: "future" }),
      { params: Promise.resolve({ id: "12" }) },
    );
    expect(status(res)).toBe(503);
  });

  test("maps an upstream Arr failure to 502", async () => {
    configure();
    mockSetSeriesMonitoring.mockRejectedValue(new Error("Arr API error (500)"));
    const res = await POST(
      jsonRequest("/api/local-arrs/series/12/monitor", { monitor: "future" }),
      { params: Promise.resolve({ id: "12" }) },
    );
    expect(status(res)).toBe(502);
    void (await jsonBody(res));
    void deleteRequest;
    void getRequest;
  });
});