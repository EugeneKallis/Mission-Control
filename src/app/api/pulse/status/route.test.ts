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
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      headersByPath.set(path, new Headers(init?.headers));
      return new Response(JSON.stringify(
        path === "/api/resources" ? { data: [{ id: "host-1" }], total: 7 } : {},
      ), { status: 200 });
    }) as typeof fetch;

    const response = await GET();
    expect(response.status).toBe(200);
    expect(headersByPath.get("/api/resources")?.get("X-API-Token")).toBe("pulse-secret");
    for (const path of ["/api/health", "/api/version", "/api/security/status"]) {
      expect(headersByPath.get(path)?.has("X-API-Token")).toBe(false);
    }
    expect((await response.json()).resourceCount).toBe(7);
  });

  test("returns unavailable when every public endpoint fails", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connection refused");
    }) as typeof fetch;

    const response = await GET();
    expect(response.status).toBe(502);
    expect((await response.json()).errors).toHaveLength(3);
  });
});
