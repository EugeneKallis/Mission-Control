/**
 * PornRips scraper.
 *
 * Fetches the 1080p category listing, parses each `article.type-post`,
 * then re-fetches each detail page to grab additional images (PixHost).
 * Filters out Trans/TGirs/.TS/Transfixed content and inserts every item.
 * Mirrors `ScrapePornRips` + `runPornRipsScrape` + `scrapeDetail` in
 * `~/ServerTool/cmd/web/handler/pornrips.go`.
 *
 * Note: the original only paginated 1 page. We follow that to avoid hammering
 * the upstream; bumping to multi-page is a one-line change when desired.
 */

import { load } from "cheerio";
import { fetchHtml, sanitizeTitle, scrapePixHost } from "./shared";
import { createScrapeResult, scrapeResultExists } from "@/lib/db/queries";

const BASE_URL = "https://pornrips.to/category/1080p/";
const MAX_PAGES = 1;

interface _ParsedItemPrivate {
  title: string;
  thumb: string;
  images: string[];
  torrent: string;
  magnet: string;
  tags: string[];
  detailURL: string;
  /** Raw file-size string like "457 MB" extracted from the detail page. */
  fileSize: string;
}
export type ParsedItem = _ParsedItemPrivate;

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export function parsePornRipsListing(html: string): ParsedItem[] {
  const $ = load(html);
  const results: ParsedItem[] = [];

  $("article.type-post").each((_, el) => {
    const $el = $(el);
    const title = $el.find(".entry-title a").text().trim();

    // Filter out non-1080p content (the Go version is explicit about this)
    if (containsAny(title, ["Transfixed", ".TS", "TGirls", "Trans."])) {
      return;
    }

    const detailURL = $el.find(".entry-title a").attr("href") ?? "";
    // The torrent and magnet URLs are NOT synthesized from postID anymore.
    // The site changed — download.php?id=X&type=* endpoints are 404.
    // Instead, the real .torrent file URL is extracted from the detail
    // page during enrichPornRipsItem below.
    let torrent = "";
    let magnet = "";

    let thumb = "";
    const thumbImg = $el.find(".wrapper-excerpt-thumbnail img");
    if (thumbImg.length) {
      thumb = thumbImg.attr("data-src") ?? thumbImg.attr("src") ?? "";
    }

    const tags: string[] = [];
    $el.find(".entry-meta-tags a").each((_, t) => {
      const text = $(t).text().trim();
      if (text) tags.push(text);
    });

    if (title) {
      results.push({ title, thumb, images: [], torrent, magnet, tags, detailURL, fileSize: "" });
    }
  });

  return results;
}

/**
 * Re-fetch a detail page to get additional images AND the direct .torrent
 * file URL. Mirrors `scrapeDetail`:
 * - looks for PixHost `show` links, follows each, captures the direct image
 * - falls back to any <img> inside .entry-content that isn't a logo/banner
 * - extracts the real .torrent URL from the download link
 * - extracts file size from the info block
 */
export async function enrichPornRipsItem(item: ParsedItem): Promise<ParsedItem> {
  if (!item.detailURL) return item;

  let html: string;
  try {
    html = await fetchHtml(item.detailURL);
  } catch {
    return item;
  }

  const $ = load(html);
  const seen = new Set<string>(item.images);

  // ── PixHost galleries ──────────────────────────────────────────────────
  const pixhostLinks = $(".entry-content a[href*='pixhost.to/show/']")
    .map((_, a) => $(a).attr("href") ?? "")
    .get()
    .filter(Boolean);
  for (const link of pixhostLinks) {
    const direct = await scrapePixHost(link);
    if (direct && !seen.has(direct)) {
      seen.add(direct);
      item.images.push(direct);
    }
  }

  // ── Fallback images in .entry-content ──────────────────────────────────
  $(".entry-content img").each((_, img) => {
    // Skip images already covered by the PixHost link we just followed
    if ($(img).closest("a[href*='pixhost.to/show/']").length > 0) return;
    const src = $(img).attr("src") ?? $(img).attr("data-src") ?? "";
    if (!src) return;
    if (containsAny(src, ["logo", "banner"])) return;
    if (!seen.has(src)) {
      seen.add(src);
      item.images.push(src);
    }
  });

  // ── Extract the real .torrent file URL ─────────────────────────────────
  // The site serves the .torrent at pornrips.to/torrents/<Title>.torrent
  // linked from within .entry-content. This is the ONLY working download
  // URL — the old download.php?id=X&type=torrent endpoint is 404.
  if (!item.torrent) {
    const torrentLink = $(".entry-content a[href$='.torrent']").first();
    if (torrentLink.length) {
      item.torrent = torrentLink.attr("href") ?? "";
    }
  }

  // ── Extract file size ──────────────────────────────────────────────────
  if (!item.fileSize) {
    const bodyText = $.text();
    const match = bodyText.match(/File Size:\s*([\d.]+\s*(?:GB|MB|KB))/i);
    if (match) {
      item.fileSize = match[1];
    }
  }

  return item;
}

export async function runPornRipsScrape(): Promise<{ pages: number; inserted: number }> {
  let pagesScanned = 0;
  let inserted = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}page/${page}/`;
    console.log(`[pornrips] page ${page}: ${url}`);

    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.warn(`[pornrips] page ${page} fetch failed:`, err);
      continue;
    }

    const items = parsePornRipsListing(html);
    if (items.length === 0) {
      console.log(`[pornrips] page ${page} returned 0 items, stopping`);
      break;
    }

    for (const item of items) {
      // Enrich FIRST — fetches the detail page to get PixHost images AND
      // the real .torrent URL. We need to enrich before the torrent URL
      // check because parsePornRipsListing no longer synthesizes
      // download.php URLs (those endpoints are 404 on the live site).
      if (item.detailURL) {
        try {
          await enrichPornRipsItem(item);
        } catch (err) {
          console.warn(`[pornrips] enrich failed for "${item.title}":`, err);
        }
      }

      // Decide final download URL — torrent wins, magnet is fallback.
      const torrentURL = item.torrent || item.magnet;
      if (!torrentURL) continue;

      const title = sanitizeTitle(item.title);
      const tagsStr = item.tags.join(",");
      const imgURL = item.images.length > 0 ? item.images.join(",") : item.thumb;
      const uniqueKey = `|${torrentURL}`;

      if (await scrapeResultExists(uniqueKey)) continue;

      // Parse file size string to bytes if available
      const fileSizeBytes = item.fileSize
        ? (await import("./shared")).parseSize(item.fileSize)
        : null;

      try {
        await createScrapeResult({
          source: "pornrips",
          title,
          imageUrl: imgURL || null,
          magnetLink: null, // pornrips has no magnet links; use torrent always
          torrentLink: torrentURL,
          uniqueKey,
          infoHash: null,
          fileSize: fileSizeBytes,
          tags: tagsStr || null,
        });
        inserted++;
      } catch (err) {
        console.warn(`[pornrips] insert failed for "${title}":`, err);
      }
    }

    pagesScanned++;
  }

  console.log(`[pornrips] done — pages=${pagesScanned}, inserted=${inserted}`);
  return { pages: pagesScanned, inserted };
}
