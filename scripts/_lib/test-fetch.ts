/**
 * Shared fetch-mock helper for one-off script tests.
 *
 * Why this lives here: the per-script test files were each rolling
 * their own `captureFetch` that did exact path matching. That broke
 * the radarr-sync "LIVE mode" test — the DELETE URL has a query
 * string and a path segment (`/movie/11?deleteFiles=true`) that
 * doesn't match the bare `DELETE /api/v3/movie` key. The mock threw
 * `Unmocked fetch`, the script failed, but the test still asserted
 * the count of attempted calls.
 *
 * This helper supports three matching strategies, in priority order:
 *
 *   1. Exact key:   `"GET /api/v3/movie?limit=50"`   — first matched
 *   2. Bare path:   `"GET /api/v3/movie"`            — strips query
 *   3. Path prefix: `"DELETE /api/v3/movie/"`        — trailing slash
 *      matches any sub-path (`/movie/11`, `/movie/11?deleteFiles=true`).
 *
 * Use 1 for fine-grained tests, 2 for the common "list" case, 3 for
 * per-resource mutations (delete, fetch-by-id).
 *
 * Example:
 *   const calls = captureFetch({
 *     "GET /api/v3/movie": () => [...],
 *     "DELETE /api/v3/movie/": () => ({}),
 *   });
 *
 * Note: this does not restore `globalThis.fetch` — tests should keep
 * the existing pattern of saving/restoring around `beforeEach` /
 * `afterEach`.
 */

export interface CapturedCall {
  url: string;
  method: string;
  body: unknown;
}

type Handler =
  | ((call: { url: string; method: string; body: unknown; query: URLSearchParams }) => unknown)
  | (() => unknown);

export interface CaptureFetchOptions {
  /**
   * Optional hook invoked *before* the handler is dispatched. Useful
   * for tests whose fixtures need to know which URL is being requested
   * (e.g. multi-instance scripts that share a route).
   */
  onCall?: (call: CapturedCall) => void;
}

export function captureFetch(
  handlers: Record<string, Handler>,
  options: CaptureFetchOptions = {},
): CapturedCall[] {
  const calls: CapturedCall[] = [];

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = url.toString();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const method = init?.method ?? "GET";
    const call: CapturedCall = { url: u, method, body };
    calls.push(call);
    options.onCall?.(call);

    const parsed = new URL(u);
    const path = parsed.pathname;
    const query = parsed.searchParams;

    // Try exact, then bare path, then prefix match.
    const exactKey = `${method} ${path}${parsed.search}`;
    const bareKey = `${method} ${path}`;
    let handler: Handler | undefined = handlers[exactKey] ?? handlers[bareKey];
    if (handler === undefined) {
      // Prefix match: any handler key that ends with "/" and is a prefix
      // of the current path.
      const methodPrefix = `${method} `;
      for (const [k, h] of Object.entries(handlers)) {
        if (k.startsWith(methodPrefix) && k.endsWith("/") && path.startsWith(k.slice(methodPrefix.length))) {
          handler = h;
          break;
        }
      }
    }
    if (handler === undefined) {
      throw new Error(`Unmocked fetch: ${method} ${u}`);
    }
    const result = handler({ url: u, method, body, query });
    return new Response(JSON.stringify(result), { status: 200 });
  }) as typeof fetch;

  return calls;
}
