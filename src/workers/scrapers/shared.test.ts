/**
 * Unit tests for src/workers/scrapers/shared.ts
 *
 * Covers:
 *  - sanitizeTitle: quotes stripped + trimmed
 *  - parseSize: GB / MB / KB / bytes, junk input, missing unit
 *  - fetchHtml: forwards UA, sets timeout, throws on non-2xx
 *  - scrapePixHost: rejects non-pixhost URLs, returns "" for bad input,
 *    extracts direct image from the input box, falls back to first <img>
 *    in #content
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { sanitizeTitle, parseSize, fetchHtml, scrapePixHost } from "./shared";

describe("sanitizeTitle", () => {
  test("strips both single and double quotes", () => {
    // The regex strips ALL single AND double quotes, including apostrophes
    // inside words. The test reflects actual behavior.
    expect(sanitizeTitle(`"Don't Stop" Me Now`)).toBe("Dont Stop Me Now");
  });

  test("trims surrounding whitespace", () => {
    expect(sanitizeTitle("   Hello World   ")).toBe("Hello World");
  });

  test("returns empty string for whitespace-only input", () => {
    expect(sanitizeTitle("   ")).toBe("");
  });

  test("leaves text without quotes untouched apart from trim", () => {
    expect(sanitizeTitle("Plain title")).toBe("Plain title");
  });
});

describe("parseSize", () => {
  test("parses GB (case-insensitive)", () => {
    expect(parseSize("2.1gb")).toBe(2.1 * 1024 ** 3);
    expect(parseSize("2.1GB")).toBe(2.1 * 1024 ** 3);
  });

  test("parses MB", () => {
    expect(parseSize("560mb")).toBe(560 * 1024 ** 2);
  });

  test("parses KB", () => {
    expect(parseSize("12kb")).toBe(12 * 1024);
  });

  test("parses bare bytes (no unit)", () => {
    expect(parseSize("1234")).toBe(1234);
  });

  test("parses 'bytes' suffix as no-multiplier", () => {
    // The Go parser doesn't know "bytes"; we follow that.
    expect(parseSize("1234bytes")).toBe(1234);
  });

  test("returns 0 for empty input", () => {
    expect(parseSize("")).toBe(0);
    expect(parseSize("   ")).toBe(0);
  });

  test("returns 0 for non-numeric input", () => {
    expect(parseSize("abc")).toBe(0);
    expect(parseSize("mb")).toBe(0);
  });

  test("lenient parseFloat accepts '12.3.4mb' as 12.3 MB (current behavior)", () => {
    // Note: parseFloat("12.3.4") returns 12.3, so the function returns
    // 12.3 * 1024^2. This is a known quirk of the JS port — the Go
    // implementation was stricter. If we ever need to harden this, it's
    // a one-line change to validate the value with a strict regex.
    expect(parseSize("12.3.4mb")).toBe(12.3 * 1024 * 1024);
  });

  test("handles whitespace between number and unit", () => {
    expect(parseSize("3.5 gb")).toBe(3.5 * 1024 ** 3);
  });
});

describe("fetchHtml", () => {
  const originalFetch = globalThis.fetch;
  let lastInit: RequestInit | undefined;
  let lastUrl: string | undefined;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(status: number, body: string) {
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      lastUrl = url;
      lastInit = init;
      return new Response(body, { status });
    }) as unknown as typeof fetch;
  }

  test("returns the response body on 200", async () => {
    mockFetch(200, "<html>hi</html>");
    expect(await fetchHtml("https://example.com")).toBe("<html>hi</html>");
    expect(lastUrl).toBe("https://example.com");
  });

  test("sets a User-Agent header", async () => {
    mockFetch(200, "ok");
    await fetchHtml("https://example.com/x");
    const headers = lastInit?.headers as Record<string, string> | undefined;
    expect(headers?.["User-Agent"]).toBe("Mozilla/5.0");
  });

  test("accepts a custom User-Agent", async () => {
    mockFetch(200, "ok");
    await fetchHtml("https://example.com/x", "TestAgent/1.0");
    const headers = lastInit?.headers as Record<string, string> | undefined;
    expect(headers?.["User-Agent"]).toBe("TestAgent/1.0");
  });

  test("throws on non-2xx status", async () => {
    mockFetch(404, "not found");
    await expect(fetchHtml("https://example.com/missing")).rejects.toThrow(/HTTP 404/);
  });

  test("attaches an AbortSignal with a 30s timeout", async () => {
    mockFetch(200, "ok");
    await fetchHtml("https://example.com");
    // The signal is wrapped in an AbortSignal.timeout — we just verify
    // it's present and an AbortSignal instance.
    const signal = lastInit?.signal as AbortSignal | undefined;
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe("scrapePixHost", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns empty string for non-pixhost URLs", async () => {
    expect(await scrapePixHost("https://example.com/show/1/2.jpg")).toBe("");
  });

  test("returns empty string for invalid URLs", async () => {
    expect(await scrapePixHost("not-a-url")).toBe("");
  });

  test("extracts direct image URL from input[type=text]", async () => {
    const html = `<html><body>
      <input type="text" value="https://i.pixhost.to/images/abc123.jpg" />
    </body></html>`;
    globalThis.fetch = mock(async () => new Response(html, { status: 200 })) as unknown as typeof fetch;

    expect(await scrapePixHost("https://pixhost.to/show/123/abc.jpg")).toBe(
      "https://i.pixhost.to/images/abc123.jpg",
    );
  });

  test("falls back to <img> inside #content when no input is found", async () => {
    const html = `<html><body>
      <div id="content">
        <img src="https://i.pixhost.to/originals/xyz.jpg" />
      </div>
    </body></html>`;
    globalThis.fetch = mock(async () => new Response(html, { status: 200 })) as unknown as typeof fetch;

    expect(await scrapePixHost("https://pixhost.to/show/999/zzz.jpg")).toBe(
      "https://i.pixhost.to/originals/xyz.jpg",
    );
  });

  test("returns empty string when the show page has no extractable image", async () => {
    const html = `<html><body><p>Nothing here</p></body></html>`;
    globalThis.fetch = mock(async () => new Response(html, { status: 200 })) as unknown as typeof fetch;

    expect(await scrapePixHost("https://pixhost.to/show/0/none.jpg")).toBe("");
  });

  test("returns empty string when fetch fails", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await scrapePixHost("https://pixhost.to/show/1/x.jpg")).toBe("");
  });
});
