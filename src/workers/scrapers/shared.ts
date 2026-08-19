/**
 * Shared helpers for the scraper workers.
 * Mirrors the helpers in ~/ServerTool/cmd/web/handler/scraper.go,
 * ~/ServerTool/cmd/web/handler/pornrips.go.
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

const DEFAULT_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
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

const PIXHOST_DOMAINS = ["pixhost.to", "pixhost.cc", "pixho.st"];

export function isPixHostShowUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol.startsWith("http")
      && PIXHOST_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
      && url.pathname.startsWith("/show/");
  } catch {
    return false;
  }
}

function directPixHostImageUrl(value: string): string {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isPixHost = PIXHOST_DOMAINS.some((domain) => hostname.endsWith(`.${domain}`));
    const isImageHost = /^(?:i|img\d+)\./.test(hostname);
    const isOriginal = /^\/(?:images|originals)\//.test(url.pathname);
    // The legacy i.pixhost.to host serves originals from paths outside
    // /images; newer imgN.pixhost.cc hosts use the explicit /images path.
    const isLegacyOriginal = hostname === "i.pixhost.to";
    return url.protocol.startsWith("http") && isPixHost && isImageHost && (isOriginal || isLegacyOriginal)
      ? value
      : "";
  } catch {
    return "";
  }
}

/**
 * Given a PixHost "show" page URL, extract the direct full-resolution image.
 * PornRips currently links to `pixhost.cc/show/...`; older records use
 * `pixhost.to`. Both show pages expose an image-host URL in a text input.
 */
export async function scrapePixHost(url: string): Promise<string> {
  if (!isPixHostShowUrl(url)) return "";

  try {
    const html = await fetchHtml(url);
    const inputMatches = html.matchAll(/<input[^>]*\bvalue="(https?:\/\/[^"\s]+)"/gi);
    for (const match of inputMatches) {
      const direct = directPixHostImageUrl(match[1]);
      if (direct) return direct;
    }

    // Fallback to a full-resolution image in the show page, never a thumbnail.
    const imageMatches = html.matchAll(/<img[^>]+src="(https?:\/\/[^"\s]+)"/gi);
    for (const match of imageMatches) {
      const direct = directPixHostImageUrl(match[1]);
      if (direct) return direct;
    }
    return "";
  } catch {
    return "";
  }
}
