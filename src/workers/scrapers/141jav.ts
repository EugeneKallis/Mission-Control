/**
 * 141jav scraper.
 *
 * Fetches up to 3 pages of https://www.141jav.com/tag/Big%20Tits, parses each
 * card with cheerio (goquery equivalent), and inserts every magnet into the
 * `scrape_results` table. Mirrors `Scrape141Jav` + `run141JavScrape` in
 * `~/ServerTool/cmd/web/handler/scraper.go`.
 */

import { load } from "cheerio";
import { fetchHtml, sanitizeTitle } from "./shared";
import { createScrapeResult, scrapeResultExists } from "@/lib/db/queries";

const BASE_URL = "https://www.141jav.com/tag/Big%20Tits";
const MAX_PAGES = 3;

interface ParsedItem {
  title: string;
  image: string;
  magnet: string;
  torrent: string;
  tags: string[];
}

export function parse141JavListing(html: string): ParsedItem[] {
  const $ = load(html);
  const results: ParsedItem[] = [];

  $(".card.mb-3").each((_, el) => {
    const $el = $(el);
    const title = $el.find("h5.title a").text().trim();

    let image = "";
    const imgEl = $el.find("img.image");
    if (imgEl.length) {
      image = imgEl.attr("src") ?? imgEl.attr("data-src") ?? "";
    }

    let magnet = "";
    let torrent = "";
    $el.find("a[href^='magnet:']").each((_, a) => {
      const href = $(a).attr("href");
      if (href && !magnet) magnet = href;
    });
    $el.find("a[href$='.torrent']").each((_, a) => {
      const href = $(a).attr("href");
      if (href && !torrent) {
        if (!href.startsWith("http")) {
          torrent = href.startsWith("/")
            ? `https://www.141jav.com${href}`
            : href;
        } else {
          torrent = href;
        }
      }
    });

    const tags: string[] = [];
    $el.find(".tag").each((_, t) => {
      const text = $(t).text().trim();
      if (text) tags.push(text);
    });

    if (title || magnet) {
      results.push({ title, image, magnet, torrent, tags });
    }
  });

  return results;
}

export async function run141JavScrape(): Promise<{ pages: number; inserted: number }> {
  let pagesScanned = 0;
  let inserted = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;
    console.log(`[141jav] page ${page}: ${url}`);

    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      console.warn(`[141jav] page ${page} fetch failed:`, err);
      continue;
    }

    const items = parse141JavListing(html);
    if (items.length === 0) {
      console.log(`[141jav] page ${page} returned 0 items, stopping`);
      break;
    }

    // Skip pages with no magnets (avoids spinning on layout-only listings).
    const withMagnets = items.filter((i) => i.magnet);
    if (withMagnets.length === 0) {
      console.log(`[141jav] page ${page} returned 0 magnets, stopping`);
      break;
    }

    for (const item of withMagnets) {
      const title = sanitizeTitle(item.title);
      const tagsStr = item.tags.join(",");
      const uniqueKey = `${item.magnet}|`;

      if (await scrapeResultExists(uniqueKey)) continue;

      try {
        await createScrapeResult({
          source: "141jav",
          title,
          imageUrl: item.image || null,
          magnetLink: item.magnet,
          torrentLink: null,
          uniqueKey,
          infoHash: null,
          fileSize: null,
          tags: tagsStr || null,
        });
        inserted++;
      } catch (err) {
        console.warn(`[141jav] insert failed for "${title}":`, err);
      }
    }

    pagesScanned++;
  }

  console.log(`[141jav] done — pages=${pagesScanned}, inserted=${inserted}`);
  return { pages: pagesScanned, inserted };
}
