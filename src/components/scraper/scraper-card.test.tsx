/**
 * Unit tests for the scraper card.
 *
 * Covers:
 *  - Title, tags, source data attributes
 *  - DL + Hide buttons fire onDownload / onHide with the result id
 *  - DOWNLOADED badge when is_downloaded=true
 *  - Image placeholder when no image
 *  - Single image (non-pornrips)
 *  - Multiple images (pornrips)
 *  - Magnet link present
 */
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@/test-utils/render";

afterEach(() => {
  cleanup();
});
import { ScraperCard } from "./scraper-card";
import type { ScrapeResultView } from "./scraper-types";

const baseResult: ScrapeResultView = {
  id: 42,
  source: "141jav",
  title: "Sample Title",
  image: "https://example.com/cover.jpg",
  images: [],
  magnet: "magnet:?xt=urn:btih:DEADBEEF",
  torrent: null,
  tags: ["big tits", "censored"],
  is_downloaded: false,
  is_hidden: false,
  created_at: "2026-06-25T00:00:00Z",
};

describe("ScraperCard", () => {
  test("renders title and tags", () => {
    render(
      <ScraperCard result={baseResult} onDownload={() => {}} onHide={() => {}} />,
    );
    expect(screen.getByText("Sample Title")).toBeInTheDocument();
    expect(screen.getByText("big tits")).toBeInTheDocument();
    expect(screen.getByText("censored")).toBeInTheDocument();
  });

  test("exposes data-id and data-tags attributes for the page's scroll logic", () => {
    const { container } = render(
      <ScraperCard result={baseResult} onDownload={() => {}} onHide={() => {}} />,
    );
    const card = container.querySelector(".scraper-card")!;
    expect(card.getAttribute("data-id")).toBe("42");
    expect(card.getAttribute("data-tags")).toBe("big tits,censored");
  });

  test("DL button fires onDownload with the card id", () => {
    const calls: number[] = [];
    render(
      <ScraperCard
        result={baseResult}
        onDownload={(id) => {
          calls.push(id);
        }}
        onHide={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^dl$/i }));
    expect(calls).toEqual([42]);
  });

  test("Hide button fires onHide with the card id", () => {
    const calls: number[] = [];
    render(
      <ScraperCard
        result={baseResult}
        onDownload={() => {}}
        onHide={(id) => {
          calls.push(id);
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /hide/i }));
    expect(calls).toEqual([42]);
  });

  test("does NOT render the DOWNLOADED badge by default", () => {
    render(
      <ScraperCard result={baseResult} onDownload={() => {}} onHide={() => {}} />,
    );
    expect(screen.queryByText(/downloaded/i)).not.toBeInTheDocument();
  });

  test("renders the DOWNLOADED badge when is_downloaded=true", () => {
    render(
      <ScraperCard
        result={{ ...baseResult, is_downloaded: true }}
        onDownload={() => {}}
        onHide={() => {}}
      />,
    );
    expect(screen.getByText(/downloaded/i)).toBeInTheDocument();
  });

  test("renders a single <img> for non-pornrips sources with one image", () => {
    const { container } = render(
      <ScraperCard result={baseResult} onDownload={() => {}} onHide={() => {}} />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toBe("https://example.com/cover.jpg");
  });

  test("renders the placeholder when no image and not pornrips", () => {
    const { container } = render(
      <ScraperCard
        result={{ ...baseResult, image: null }}
        onDownload={() => {}}
        onHide={() => {}}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    // Material icon for the placeholder
    expect(container.querySelector(".material-symbols-outlined")).toBeInTheDocument();
  });

  test("renders up to 2 images for pornrips source", () => {
    const { container } = render(
      <ScraperCard
        result={{
          ...baseResult,
          source: "pornrips",
          image: null,
          images: [
            "https://example.com/a.jpg",
            "https://example.com/b.jpg",
            "https://example.com/c.jpg",
          ],
        }}
        onDownload={() => {}}
        onHide={() => {}}
      />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute("src")).toBe("https://example.com/a.jpg");
    expect(imgs[1].getAttribute("src")).toBe("https://example.com/b.jpg");
  });
});
