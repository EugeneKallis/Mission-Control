/**
 * Shared helpers for the scraper workers.
 * Mirrors the helpers in ~/ServerTool/cmd/web/handler/scraper.go,
 * ~/ServerTool/cmd/web/handler/projectjav.go, and ~/ServerTool/cmd/web/handler/pornrips.go.
 */

// ── Title / size helpers ──────────────────────────────────────────────────

/**
 * Strip quotes and trim. Mirrors `sanitizeTitle` in scraper.go.
 */
export function sanitizeTitle(title: string): string {
  return title.replace(/["']/g, "").trim();
}

/**
 * Parse a size string like "2.1gb" / "560mb" / "12kb" into bytes.
 * Returns 0 for unparseable input. Mirrors `parseSize` in scraper.go.
 */
export function parseSize(sizeStr: string): number {
  const lower = sizeStr.toLowerCase().trim();
  if (!lower) return 0;

  let unit = "";
  let valStr = lower;
  if (lower.endsWith("gb")) {
    unit = "gb";
    valStr = lower.slice(0, -2);
  } else if (lower.endsWith("mb")) {
    unit = "mb";
    valStr = lower.slice(0, -2);
  } else if (lower.endsWith("kb")) {
    unit = "kb";
    valStr = lower.slice(0, -2);
  }

  const val = parseFloat(valStr.trim());
  if (isNaN(val)) return 0;

  switch (unit) {
    case "gb":
      return val * 1024 * 1024 * 1024;
    case "mb":
      return val * 1024 * 1024;
    case "kb":
      return val * 1024;
    default:
      return val;
  }
}

// ── HTTP fetch with User-Agent ────────────────────────────────────────────

const DEFAULT_UA = "Mozilla/5.0";
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetch a URL and return the body as text. Sets a UA so sites that block empty
 * user agents still respond. Throws on non-200 status or timeout.
 */
export async function fetchHtml(url: string, userAgent = DEFAULT_UA): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

// ── PixHost image extraction (PornRips detail scrape) ─────────────────────

/**
 * Given a PixHost "show" page URL, extract the direct image URL.
 * PixHost "show" pages embed the direct image URL in a content box; the Go
 * implementation looks for `img.images.png` style URLs. The fallback is to
 * return any img src in the show page.
 */
export async function scrapePixHost(url: string): Promise<string> {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().endsWith("pixhost.to")) return "";
  } catch {
    return "";
  }

  try {
    const html = await fetchHtml(url);
    // The direct image is the largest <img> tag inside the #content div
    // PixHost uses /show/<id>/<file> in the URL; the direct image sits in
    // <input class="form-control" value="https://..."> in the original Go code.
    // We do a best-effort regex extraction here.
    const match = html.match(/<input[^>]*type="text"[^>]*value="(https?:\/\/i\.(?:pixhost|img)\.[^"]+\.(?:jpg|jpeg|png|gif|webp))"/i);
    if (match) return match[1];

    // Fallback: look for the first image inside a #content container
    const imgMatch = html.match(/<div id="content"[\s\S]*?<img[^>]+src="([^"]+)"/i);
    if (imgMatch) return imgMatch[1];

    return "";
  } catch {
    return "";
  }
}
