/**
 * Unit tests for src/workers/scrapers/projectjav.ts
 *
 * Covers parseProjectJAVListing with hand-crafted HTML fixtures. The
 * site uses a `.video-item` selector with a `.name a` (title + page
 * URL), `.img-area img` (with data-srcset), a `.badge-secondary` tag
 * list, and a file table with magnet + size + seeds + leechers.
 *
 * Note: the runX orchestrator's behavior is tested via real scrapes
 * (see src/workers/scraper-runner.test.ts). The unit tests here cover
 * just the parser.
 */

import { describe, test, expect } from "bun:test";
import { parseProjectJAVListing } from "./projectjav";

describe("parseProjectJAVListing", () => {
  test("returns an empty array when there are no video items", () => {
    expect(parseProjectJAVListing("<html><body>nope</body></html>")).toEqual([]);
  });

  test("parses a full item with all fields", () => {
    const html = `<html><body>
      <div class="video-item">
        <div class="name"><a href="/video/abc-123/">Some Scene Title</a></div>
        <div class="img-area">
          <img data-srcset="https://cdn.example.com/abc-1x.jpg 1x, https://cdn.example.com/abc-2x.jpg 2x" />
        </div>
        <span class="badge-secondary"><a>Big Tits</a></span>
        <span class="badge-secondary"><a>POV</a></span>
        <table>
          <tr>
            <td><a href="magnet:?xt=urn:btih:DEADBEEF">magnet</a></td>
            <td>1.2gb</td>
            <td>S: 100</td>
            <td>L: 5</td>
          </tr>
        </table>
      </div>
    </body></html>`;

    const items = parseProjectJAVListing(html);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Some Scene Title");
    expect(items[0].pageURL).toBe("https://projectjav.com/video/abc-123/");
    expect(items[0].image).toBe("https://cdn.example.com/abc-2x.jpg");
    expect(items[0].tags).toEqual(["Big Tits", "POV"]);
    expect(items[0].files).toHaveLength(1);
    expect(items[0].files[0].magnet).toBe("magnet:?xt=urn:btih:DEADBEEF");
    expect(items[0].files[0].fileSize).toBe("1.2gb");
    expect(items[0].files[0].seeds).toBe(100);
    expect(items[0].files[0].leechers).toBe(5);
  });

  test("keeps an absolute page URL untouched", () => {
    const html = `<div class="video-item">
      <div class="name"><a href="https://other.example.com/v/1">X</a></div>
      <div class="img-area"><img src="https://cdn.example.com/x.jpg" /></div>
      <table>
        <tr>
          <td><a href="magnet:?xt=urn:btih:AAAA">m</a></td>
          <td>500mb</td><td>S: 1</td><td>L: 0</td>
        </tr>
      </table>
    </div>`;
    const items = parseProjectJAVListing(html);
    expect(items[0].pageURL).toBe("https://other.example.com/v/1");
  });

  test("skips placeholder nocover images", () => {
    const html = `<div class="video-item">
      <div class="name"><a href="/v/x">Hidden</a></div>
      <div class="img-area"><img src="https://cdn.example.com/images/nocover.jpeg" /></div>
    </div>`;
    expect(parseProjectJAVListing(html)).toEqual([]);
  });

  test("falls back to data-src / src when data-srcset is missing", () => {
    const html = `<div class="video-item">
      <div class="name"><a href="/v/x">X</a></div>
      <div class="img-area"><img data-src="https://cdn.example.com/data-src.jpg" /></div>
      <table>
        <tr>
          <td><a href="magnet:?xt=urn:btih:AAAA">m</a></td>
          <td>500mb</td><td>S: 1</td><td>L: 0</td>
        </tr>
      </table>
    </div>`;
    expect(parseProjectJAVListing(html)[0].image).toBe("https://cdn.example.com/data-src.jpg");

    const html2 = `<div class="video-item">
      <div class="name"><a href="/v/x">X</a></div>
      <div class="img-area"><img src="https://cdn.example.com/src.jpg" /></div>
      <table>
        <tr>
          <td><a href="magnet:?xt=urn:btih:AAAA">m</a></td>
          <td>500mb</td><td>S: 1</td><td>L: 0</td>
        </tr>
      </table>
    </div>`;
    expect(parseProjectJAVListing(html2)[0].image).toBe("https://cdn.example.com/src.jpg");
  });

  test("skips items missing the page URL", () => {
    const html = `<div class="video-item">
      <div class="name"><span>No Link</span></div>
      <div class="img-area"><img src="https://cdn.example.com/x.jpg" /></div>
    </div>`;
    expect(parseProjectJAVListing(html)).toEqual([]);
  });

  test("skips items with no magnet files", () => {
    const html = `<div class="video-item">
      <div class="name"><a href="/v/x">X</a></div>
      <div class="img-area"><img src="https://cdn.example.com/x.jpg" /></div>
      <table><tr><td>no magnet</td></tr></table>
    </div>`;
    expect(parseProjectJAVListing(html)).toEqual([]);
  });

  test("parses multiple files in a single item", () => {
    const html = `<div class="video-item">
      <div class="name"><a href="/v/x">X</a></div>
      <div class="img-area"><img src="https://cdn.example.com/x.jpg" /></div>
      <table>
        <tr>
          <td><a href="magnet:?xt=urn:btih:1111">m</a></td>
          <td>1gb</td><td>S: 1</td><td>L: 0</td>
        </tr>
        <tr>
          <td><a href="magnet:?xt=urn:btih:2222">m</a></td>
          <td>500mb</td><td>S: 5</td><td>L: 1</td>
        </tr>
      </table>
    </div>`;
    const items = parseProjectJAVListing(html);
    expect(items[0].files).toHaveLength(2);
    expect(items[0].files[0].magnet).toBe("magnet:?xt=urn:btih:1111");
    expect(items[0].files[1].magnet).toBe("magnet:?xt=urn:btih:2222");
  });

  test("seeds / leechers parser drops 's:' and 'l:' prefixes", () => {
    const html = `<div class="video-item">
      <div class="name"><a href="/v/x">X</a></div>
      <div class="img-area"><img src="https://cdn.example.com/x.jpg" /></div>
      <table>
        <tr>
          <td><a href="magnet:?xt=urn:btih:1111">m</a></td>
          <td>1gb</td><td>s: 42</td><td>l: 7</td>
        </tr>
      </table>
    </div>`;
    const items = parseProjectJAVListing(html);
    expect(items[0].files[0].seeds).toBe(42);
    expect(items[0].files[0].leechers).toBe(7);
  });

  test("seeds / leechers with non-numeric text default to 0", () => {
    const html = `<div class="video-item">
      <div class="name"><a href="/v/x">X</a></div>
      <div class="img-area"><img src="https://cdn.example.com/x.jpg" /></div>
      <table>
        <tr>
          <td><a href="magnet:?xt=urn:btih:1111">m</a></td>
          <td>1gb</td><td>--</td><td>n/a</td>
        </tr>
      </table>
    </div>`;
    const items = parseProjectJAVListing(html);
    expect(items[0].files[0].seeds).toBe(0);
    expect(items[0].files[0].leechers).toBe(0);
  });

  test("title whitespace is collapsed (multi-line name -> single space)", () => {
    const html = `<div class="video-item">
      <div class="name"><a href="/v/x">
        Multi
        Line
        Title
      </a></div>
      <div class="img-area"><img src="https://cdn.example.com/x.jpg" /></div>
      <table>
        <tr>
          <td><a href="magnet:?xt=urn:btih:1111">m</a></td>
          <td>1gb</td><td>S: 1</td><td>L: 0</td>
        </tr>
      </table>
    </div>`;
    const items = parseProjectJAVListing(html);
    expect(items[0].title).toBe("Multi Line Title");
  });
});
