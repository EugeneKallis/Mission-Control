import { afterEach, describe, expect, test } from "bun:test";
import { checkHttpIntegration, parseNamedEndpoints, summarizeIntegrationHealth, type IntegrationHealthItem } from "./integration-health";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const base = { id: "one", category: "Test", name: "One", detail: "", latencyMs: null };

describe("integration health", () => {
  test("summarizes every state", () => {
    const items: IntegrationHealthItem[] = [
      { ...base, state: "healthy" },
      { ...base, id: "two", state: "error" },
      { ...base, id: "three", state: "unconfigured" },
      { ...base, id: "four", state: "healthy" },
    ];
    expect(summarizeIntegrationHealth(items)).toEqual({ healthy: 2, error: 1, unconfigured: 1 });
  });

  test("parses valid named endpoints and ignores malformed lines", () => {
    expect(parseNamedEndpoints("One=http://one:8080/\nbad\nTwo=https://two:8080\nNo=ftp://no")).toEqual([
      { id: "config-0", name: "One", apiUrl: "http://one:8080" },
      { id: "config-2", name: "Two", apiUrl: "https://two:8080" },
    ]);
  });

  test("does not fetch an unconfigured integration", async () => {
    let fetched = false;
    globalThis.fetch = (async () => { fetched = true; return new Response(); }) as unknown as typeof fetch;
    const result = await checkHttpIntegration({ ...base, configured: false, url: "http://unused" });
    expect(result.state).toBe("unconfigured");
    expect(fetched).toBe(false);
  });

  test("reports healthy and failing HTTP responses without reading secret bodies", async () => {
    globalThis.fetch = (async () => new Response("secret", { status: 401 })) as unknown as typeof fetch;
    const failed = await checkHttpIntegration({ ...base, configured: true, url: "http://example.test" });
    expect(failed).toMatchObject({ state: "error", detail: "HTTP 401" });

    globalThis.fetch = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const healthy = await checkHttpIntegration({ ...base, configured: true, url: "http://example.test" });
    expect(healthy).toMatchObject({ state: "healthy", detail: "HTTP 204" });
  });
});
