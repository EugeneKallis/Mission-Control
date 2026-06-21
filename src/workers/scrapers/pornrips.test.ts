/**
 * Unit tests for src/workers/scrapers/pornrips.ts
 *
 * Covers:
 *  - parsePornRipsListing: card shape, title filter, magnet/torrent URL
 *    composition, thumb extraction, tag list.
 *  - enrichPornRipsItem:    PixHost enrichment with mocked fetch.
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { parsePornRipsListing, enrichPornRipsItem, type ParsedItem } from "./pornrips";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("parsePornRipsListing", () => {
  test("returns an empty array when no articles are present", () => {
    expect(parsePornRipsListing("<html><body>empty</body></html>")).toEqual([]);
  });

  test("parses a full article", () => {
    const html = `<html><body>
      <article id="post-42" class="type-post">
        <h2 class="entry-title"><a href="https://pornrips.to/some-scene/">Some Scene 1080p</a></h2>
        <div class="wrapper-excerpt-thumbnail">
          <img data-src="https://cdn.example.com/thumb42.jpg" />
        </div>
        <div class="entry-meta-tags">
          <a>1080p</a>
          <a>MILF</a>
        </div>
      </article>
    </body></html>`;

    const items = parsePornRipsListing(html) as (ParsedItem & { detailURL?: string })[];
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Some Scene 1080p");
    expect(items[0].thumb).toBe("https://cdn.example.com/thumb42.jpg");
    expect(items[0].detailURL).toBe("https://pornrips.to/some-scene/");
    expect(items[0].torrent).toBe("https://pornrips.to/download.php?id=42&type=torrent");
    expect(items[0].magnet).toBe("https://pornrips.to/download.php?id=42&type=magnet");
    expect(items[0].tags).toEqual(["1080p", "MILF"]);
    expect(items[0].images).toEqual([]);
  });

  test("filters out titles containing 'Transfixed', '.TS', 'TGirls', or 'Trans.'", () => {
    const banned = ["Transfixed Special", "Movie.TS.thing", "TGirls Vol 1", "Trans. Special"];
    for (const title of banned) {
      const html = `<article id="post-1" class="type-post">
        <h2 class="entry-title"><a>${title}</a></h2>
      </article>`;
      expect(parsePornRipsListing(html)).toEqual([]);
    }
  });

  test("falls back to src when data-src is missing", () => {
    const html = `<article id="post-1" class="type-post">
      <h2 class="entry-title"><a>X</a></h2>
      <div class="wrapper-excerpt-thumbnail">
        <img src="https://cdn.example.com/src.jpg" />
      </div>
    </article>`;
    const items = parsePornRipsListing(html);
    expect(items[0].thumb).toBe("https://cdn.example.com/src.jpg");
  });

  test("emits no torrent/magnet URLs when post id is missing", () => {
    const html = `<article class="type-post">
      <h2 class="entry-title"><a>X</a></h2>
    </article>`;
    const items = parsePornRipsListing(html);
    expect(items[0].torrent).toBe("");
    expect(items[0].magnet).toBe("");
  });
});

describe("enrichPornRipsItem", () => {
  test("returns the item unchanged when no detailURL is set", async () => {
    const item: ParsedItem = {
      title: "X",
      thumb: "t",
      images: [],
      torrent: "tr",
      magnet: "mg",
      tags: [],
    };
    expect(await enrichPornRipsItem(item)).toBe(item);
  });

  test("returns the item unchanged when fetch fails", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const item: ParsedItem = {
      title: "X",
      thumb: "t",
      images: [],
      torrent: "tr",
      magnet: "mg",
      tags: [],
    };
    expect(await enrichPornRipsItem({ ...item, detailURL: "https://pornrips.to/x" })).toMatchObject({
      title: "X",
    });
  });

  test("captures direct PixHost images from show links", async () => {
    const detailHtml = `<html><body>
      <div class="entry-content">
        <a href="https://pixhost.to/show/100/aaa.jpg">view</a>
        <a href="https://pixhost.to/show/101/bbb.jpg">view 2</a>
      </div>
    </body></html>`;
    // Each PixHost "show" call returns the page with the direct image in <input>
    const pixhostHtml = (url: string) =>
      `<html><body><input type="text" value="${url.replace("pixhost.to/show", "i.pixhost.to/images")}" /></body></html>`;

    globalThis.fetch = mock(async (url: string) => {
      const html = url.includes("pixhost.to/show")
        ? pixhostHtml(url)
        : detailHtml;
      return new Response(html, { status: 200 });
    }) as unknown as typeof fetch;

    const item: ParsedItem = {
      title: "X",
      thumb: "t",
      images: [],
      torrent: "tr",
      magnet: "mg",
      tags: [],
    };
    const enriched = await enrichPornRipsItem({ ...item, detailURL: "https://pornrips.to/x" });
    expect(enriched.images).toEqual([
      "https://i.pixhost.to/images/100/aaa.jpg",
      "https://i.pixhost.to/images/101/bbb.jpg",
    ]);
  });

  test("falls back to .entry-content <img> tags when no PixHost links are present", async () => {
    const detailHtml = `<html><body>
      <div class="entry-content">
        <img src="https://cdn.example.com/screen1.jpg" />
        <img src="https://cdn.example.com/banner.png" />  <!-- filtered -->
        <img src="https://cdn.example.com/screen2.jpg" />
      </div>
    </body></html>`;

    globalThis.fetch = mock(async () => new Response(detailHtml, { status: 200 })) as unknown as typeof fetch;

    const item: ParsedItem = {
      title: "X",
      thumb: "t",
      images: [],
      torrent: "tr",
      magnet: "mg",
      tags: [],
    };
    const enriched = await enrichPornRipsItem({ ...item, detailURL: "https://pornrips.to/x" });
    expect(enriched.images).toEqual([
      "https://cdn.example.com/screen1.jpg",
      "https://cdn.example.com/screen2.jpg",
    ]);
  });

  test("skips fallback <img> tags that are nested inside a PixHost anchor", async () => {
    // The detail page has an <a href=pixhost.to/show/...> wrapping an <img>.
    // The PixHost "show" page returns a direct image URL matching the regex
    // (i.pixhost.to host). The fallback loop in the parser walks .entry-content
    // img and skips any img whose closest <a> points to a pixhost show link.
    const detailHtml = `<html><body>
      <div class="entry-content">
        <a href="https://pixhost.to/show/100/aaa.jpg">
          <img src="https://i.pixhost.to/wrapped.jpg" />
        </a>
      </div>
    </body></html>`;
    const pixhostHtml = `<input type="text" value="https://i.pixhost.to/wrapped.jpg" />`;

    globalThis.fetch = mock(async (url: string) => {
      const html = url.includes("pixhost.to/show") ? pixhostHtml : detailHtml;
      return new Response(html, { status: 200 });
    }) as unknown as typeof fetch;

    const item: ParsedItem = {
      title: "X",
      thumb: "t",
      images: [],
      torrent: "tr",
      magnet: "mg",
      tags: [],
    };
    const enriched = await enrichPornRipsItem({ ...item, detailURL: "https://pornrips.to/x" });
    // The PixHost branch added the direct image once. The fallback branch
    // skipped the wrapped <img> because it's inside a PixHost anchor — so
    // the list still has only one entry (no duplicate).
    expect(enriched.images).toEqual(["https://i.pixhost.to/wrapped.jpg"]);
  });
});
