/**
 * ProjectJAV scraper.
 *
 * Fetches up to 3 pages of https://projectjav.com/tag/big-tits-7/, parses
 * each `.video-item`, and inserts one row per item using its first magnet.
 * Mirrors `ScrapeProjectJAV` + `runProjectJAVScrape` in
 * `~/ServerTool/cmd/web/handler/projectjav.go` and `~/ServerTool/cmd/web/handler/scraper.go`.
 */

import { load } from "cheerio";
import { fetchHtml, sanitizeTitle } from "./shared";
import { createScrapeResult, scrapeResultExists } from "@/lib/db/queries";

const BASE_URL = "https://projectjav.com/tag/big-tits-7/";
const MAX_PAGES = 3;

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

export async function runProjectJAVScrape(): Promise<{ pages: number; inserted: number }> {
  let pagesScanned = 0;
  let inserted = 0;

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
      const first = item.files[0];
      if (!first) continue;
      const uniqueKey = `${first.magnet}|`;
      if (await scrapeResultExists(uniqueKey)) continue;

      try {
        await createScrapeResult({
          source: "projectjav",
          title: sanitizeTitle(item.title),
          imageUrl: item.image || null,
          magnetLink: first.magnet,
          torrentLink: null,
          uniqueKey,
          infoHash: null,
          fileSize: first.fileSize || null,
          tags: item.tags.join(",") || null,
        });
        inserted++;
      } catch (err) {
        console.warn(`[projectjav] insert failed for "${item.title}":`, err);
      }
    }
    pagesScanned++;
  }

  console.log(`[projectjav] done — pages=${pagesScanned}, inserted=${inserted}`);
  return { pages: pagesScanned, inserted };
}
