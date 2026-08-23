import { describe, expect, mock, test } from "bun:test";

const getArrDriftReport = mock(async (baseline?: string) => ({
  generatedAt: "2026-08-23T00:00:00.000Z",
  baselineSlug: baseline ?? "radarr",
  instances: [],
}));

mock.module("@/lib/arr-drift", () => ({ getArrDriftReport }));
const { GET } = await import(`./route.ts?bust=${Date.now()}`);

describe("GET /api/arr-drift", () => {
  test("passes the selected baseline and disables caching", async () => {
    const response = await GET(new Request("http://localhost/api/arr-drift?baseline=sonarranime"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getArrDriftReport).toHaveBeenCalledWith("sonarranime");
    expect(await response.json()).toMatchObject({ baselineSlug: "sonarranime", instances: [] });
  });
});
