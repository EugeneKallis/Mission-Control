import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@/lib/db", () => ({
  db: { config: { findUnique: async () => null } },
}));

const { GET } = await import("./route");

const originalFetch = globalThis.fetch;
const originalPulseApiKey = process.env.PULSE_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalPulseApiKey === undefined) delete process.env.PULSE_API_KEY;
  else process.env.PULSE_API_KEY = originalPulseApiKey;
});

describe("GET /api/pulse/status", () => {
  test("returns the public Pulse health snapshot", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith("/health")
        ? { status: "healthy", uptime: 1234, dependencies: { monitor: true } }
        : url.endsWith("/version")
          ? { version: "6.2.1", build: "release" }
          : { requiresAuth: true, ssoEnabled: false };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.health.status).toBe("healthy");
    expect(body.health.uptime).toBe(1234);
    expect(body.version.version).toBe("6.2.1");
    expect(body.security.requiresAuth).toBe(true);
    expect(body.errors).toEqual([]);
  });

  test("returns partial data when one public endpoint fails", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/health")) {
        throw new Error("connection refused");
      }
      return new Response(JSON.stringify({ version: "6.2.1" }), { status: 200 });
    }) as typeof fetch;

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.health).toBeNull();
    expect(body.version.version).toBe("6.2.1");
    expect(body.errors).toEqual([expect.stringContaining("/api/health")]);
  });

  test("sends the configured API key to the authenticated resources endpoint", async () => {
    process.env.PULSE_API_KEY = "pulse-secret";
    const headersByPath = new Map<string, Headers>();
    let resourceRequests = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname;
      headersByPath.set(path, new Headers(init?.headers));
      if (path === "/api/resources") {
        resourceRequests += 1;
        const page = Number(url.searchParams.get("page"));
        const data = page === 1
          ? Array.from({ length: 100 }, (_, index) => ({ id: `host-${index}` }))
          : [{ id: "host-100" }];
        return new Response(JSON.stringify({ data, total: 101 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    const response = await GET();
    expect(response.status).toBe(200);
    expect(headersByPath.get("/api/resources")?.get("X-API-Token")).toBe("pulse-secret");
    for (const path of ["/api/health", "/api/version", "/api/security/status"]) {
      expect(headersByPath.get(path)?.has("X-API-Token")).toBe(false);
    }
    const body = await response.json();
    expect(body.resourceCount).toBe(101);
    expect(body.resources).toHaveLength(101);
    expect(resourceRequests).toBe(2);
  });

  test("returns unavailable when every public endpoint fails", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;

    const response = await GET();
    expect(response.status).toBe(502);
    expect((await response.json()).errors).toHaveLength(3);
  });
});
