/**
 * Unit tests for src/workers/scrapers/141jav.ts
 *
 * Covers parse141JavListing with hand-crafted HTML fixtures. The 141jav
 * site uses a `card.mb-3` selector with an h5.title, an img.image, a
 * magnet link, an optional .torrent link, and a .tag list.
 */

import { describe, test, expect } from "bun:test";
import { parse141JavListing } from "./141jav";

describe("parse141JavListing", () => {
  test("returns an empty array when there are no cards", () => {
    expect(parse141JavListing("<html><body>Empty</body></html>")).toEqual([]);
  });

  test("parses a single card with all fields present", () => {
    const html = `<html><body>
      <div class="card mb-3">
        <h5 class="title">
          <a href="/post/abc">Big Tits Example 1</a>
        </h5>
        <img class="image" src="https://cdn.example.com/abc.jpg" />
        <a href="magnet:?xt=urn:btih:AAAA">magnet</a>
        <a href="/dl/abc.torrent">.torrent</a>
        <span class="tag">big tits</span>
        <span class="tag">creampie</span>
      </div>
    </body></html>`;

    const items = parse141JavListing(html);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      title: "Big Tits Example 1",
      image: "https://cdn.example.com/abc.jpg",
      magnet: "magnet:?xt=urn:btih:AAAA",
      torrent: "https://www.141jav.com/dl/abc.torrent",
      tags: ["big tits", "creampie"],
    });
  });

  test("falls back to data-src for the image", () => {
    const html = `<div class="card mb-3">
      <h5 class="title"><a>X</a></h5>
      <img class="image" data-src="https://cdn.example.com/lazy.jpg" />
      <a href="magnet:?xt=urn:btih:BBBB">m</a>
    </div>`;
    const items = parse141JavListing(html);
    expect(items[0].image).toBe("https://cdn.example.com/lazy.jpg");
  });

  test("keeps the torrent URL absolute when it already has a scheme", () => {
    const html = `<div class="card mb-3">
      <h5 class="title"><a>X</a></h5>
      <a href="magnet:?xt=urn:btih:CCCC">m</a>
      <a href="https://other.example.com/file.torrent">.torrent</a>
    </div>`;
    const items = parse141JavListing(html);
    expect(items[0].torrent).toBe("https://other.example.com/file.torrent");
  });

  test("treats a magnet-relative href as the magnet itself", () => {
    const html = `<div class="card mb-3">
      <h5 class="title"><a>X</a></h5>
      <a href="magnet:?xt=urn:btih:DDDD">m</a>
    </div>`;
    const items = parse141JavListing(html);
    expect(items[0].magnet).toBe("magnet:?xt=urn:btih:DDDD");
  });

  test("includes items even when only a title is present (no magnet)", () => {
    const html = `<div class="card mb-3">
      <h5 class="title"><a>Title only</a></h5>
    </div>`;
    const items = parse141JavListing(html);
    expect(items).toHaveLength(1);
    expect(items[0].magnet).toBe("");
    expect(items[0].title).toBe("Title only");
  });

  test("returns multiple cards in document order", () => {
    const html = `<div class="card mb-3">
      <h5 class="title"><a>One</a></h5>
      <a href="magnet:?xt=urn:btih:1111">m</a>
    </div>
    <div class="card mb-3">
      <h5 class="title"><a>Two</a></h5>
      <a href="magnet:?xt=urn:btih:2222">m</a>
    </div>`;
    const items = parse141JavListing(html);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("One");
    expect(items[1].title).toBe("Two");
  });

  test("skips cards that have neither a title nor a magnet", () => {
    const html = `<div class="card mb-3">
      <img class="image" src="x.jpg" />
    </div>
    <div class="card mb-3">
      <h5 class="title"><a>Has title</a></h5>
    </div>`;
    const items = parse141JavListing(html);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Has title");
  });
});
