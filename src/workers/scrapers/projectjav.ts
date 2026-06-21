/**
 * ProjectJAV scraper.
 *
 * Fetches up to 3 pages of https://projectjav.com/tag/big-tits-7/, parses
 * each `.video-item` for title, image, files (magnet + size + seeds + leechers)
 * and tags, then performs a single Torbox `checkCached` batch for every hash
 * across all items, and inserts the largest cached file per item. Skips VR
 * tagged items entirely. Mirrors `ScrapeProjectJAV` + `runProjectJAVScrape` in
 * `~/ServerTool/cmd/web/handler/projectjav.go` and `~/ServerTool/cmd/web/handler/scraper.go`.
 */

import { load } from "cheerio";
import { fetchHtml, parseSize, sanitizeTitle, getTorboxClient } from "./shared";
import { createScrapeResult, scrapeResultExists } from "@/lib/db/queries";
import { TorboxClient } from "@/lib/clients/torbox";

const BASE_URL = "https://projectjav.com/tag/big-tits-7/";
const MAX_PAGES = 3;

const SKIP_TAGS = new Set([
  "vr",
  "vr exclusive",
  "high-quality vr",
  "8kvr",
  "high quality vr",
]);

interface ScrapeFile {
  magnet: string;
  fileSize: string;
  seeds: number;
  leechers: number;
}

interface ParsedItem {
  title: string;
  image: string;
  pageURL: string;
  files: ScrapeFile[];
  tags: string[];
}

export function parseProjectJAVListing(html: string): ParsedItem[] {
  const $ = load(html);
  const results: ParsedItem[] = [];

  $(".video-item").each((_, el) => {
    const $el = $(el);

    // Title — collapse whitespace like the Go strings.Fields does
    const title = $el.find(".name a").text().trim().split(/\s+/).join(" ");

    // Page URL — required; skip item if missing
    let pageURL = "";
    const href = $el.find(".name a").attr("href");
    if (href) {
      pageURL = href.startsWith("http") ? href : `https://projectjav.com${href}`;
    } else {
      return;
    }

    // Image — parse the data-srcset for the highest-res URL (last "http" to next space)
    let image = "";
    const srcset = $el.find(".img-area img").attr("data-srcset");
    if (srcset) {
      const lastHttp = srcset.lastIndexOf("http");
      if (lastHttp !== -1) {
        const candidate = srcset.slice(lastHttp);
        const spaceIdx = candidate.indexOf(" ");
        image = (spaceIdx > 0 ? candidate.slice(0, spaceIdx) : candidate).trim();
      }
    }
    if (!image) {
      image =
        $el.find(".img-area img").attr("data-src") ??
        $el.find(".img-area img").attr("src") ??
        "";
    }

    // Skip placeholder
    if (image.includes("/images/nocover.jpeg")) return;

    // Tags
    const tags: string[] = [];
    $el.find(".badge-secondary a").each((_, t) => {
      const text = $(t).text().trim();
      if (text) tags.push(text);
    });

    // Files table — each row with a magnet link
    const files: ScrapeFile[] = [];
    $el.find("table tr").each((_, tr) => {
      const $tr = $(tr);
      const magnetLink = $tr.find("a[href^='magnet:']");
      if (magnetLink.length === 0) return;
      const magnet = magnetLink.attr("href") ?? "";
      if (!magnet) return;

      // td.1 = size, td.2 = seeds, td.3 = leechers
      const tds = $tr.find("td");
      const fileSize = tds.eq(1).text().trim();
      const seedsStr = tds.eq(2).text().trim().toLowerCase().replace(/^s:\s*/, "");
      const leechStr = tds.eq(3).text().trim().toLowerCase().replace(/^l:\s*/, "");
      const seeds = parseInt(seedsStr, 10) || 0;
      const leechers = parseInt(leechStr, 10) || 0;

      files.push({ magnet, fileSize, seeds, leechers });
    });

    if (title && files.length > 0) {
      results.push({ title, image, pageURL, files, tags });
    }
  });

  return results;
}

function shouldSkipByTags(tags: string[]): boolean {
  return tags.some((t) => SKIP_TAGS.has(t.toLowerCase()));
}

export async function runProjectJAVScrape(): Promise<{ pages: number; inserted: number; skipped: number }> {
  let pagesScanned = 0;
  let inserted = 0;
  let skipped = 0;

  const allItems: ParsedItem[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;
    console.log(`[projectjav] page ${page}: ${url}`);

    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.warn(`[projectjav] page ${page} fetch failed:`, err);
      continue;
    }

    const items = parseProjectJAVListing(html);
    if (items.length === 0) {
      console.log(`[projectjav] page ${page} returned 0 items, stopping`);
      break;
    }

    for (const item of items) {
      if (shouldSkipByTags(item.tags)) {
        skipped++;
        continue;
      }
      allItems.push(item);
    }
    pagesScanned++;
  }

  // Batch Torbox cache check across every hash for every item
  const allHashes: string[] = [];
  for (const item of allItems) {
    for (const f of item.files) {
      const h = TorboxClient.extractHashFromMagnet(f.magnet);
      if (h) allHashes.push(h);
    }
  }

  // Dedupe hashes (Torbox dedupes server-side but we save the request body)
  const uniqueHashes = Array.from(new Set(allHashes));
  let cachedMap = new Map<string, boolean>();
  if (uniqueHashes.length > 0) {
    try {
      const client = getTorboxClient();
      cachedMap = await client.checkCached(uniqueHashes);
    } catch (err) {
      console.warn(`[projectjav] torbox cache check failed (continuing without filter):`, err);
    }
  }

  // Insert one row per item — largest cached file wins; if nothing is cached
  // the item is skipped entirely.
  for (const item of allItems) {
    const cachedFiles = item.files
      .filter((f) => {
        const h = TorboxClient.extractHashFromMagnet(f.magnet);
        return h && cachedMap.get(h) === true;
      })
      .sort((a, b) => parseSize(b.fileSize) - parseSize(a.fileSize));

    if (cachedFiles.length === 0) {
      continue;
    }
    const best = cachedFiles[0];

    const title = sanitizeTitle(item.title);
    const tagsStr = item.tags.join(",");
    const uniqueKey = `${best.magnet}|`;
    const infoHash = TorboxClient.extractHashFromMagnet(best.magnet);

    if (await scrapeResultExists(uniqueKey)) continue;

    try {
      await createScrapeResult({
        source: "projectjav",
        title,
        imageUrl: item.image || null,
        magnetLink: best.magnet,
        torrentLink: null,
        uniqueKey,
        infoHash: infoHash || null,
        fileSize: best.fileSize || null,
        tags: tagsStr || null,
      });
      inserted++;
    } catch (err) {
      console.warn(`[projectjav] insert failed for "${title}":`, err);
    }
  }

  console.log(
    `[projectjav] done — pages=${pagesScanned}, inserted=${inserted}, skipped=${skipped}`
  );
  return { pages: pagesScanned, inserted, skipped };
}
