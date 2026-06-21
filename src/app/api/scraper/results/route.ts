/**
 * GET /api/scraper/results?source=
 * Returns the visible (not hidden) scrape results for the given source.
 * Mirrors the Go APIScraperResults handler.
 */

import { NextRequest, NextResponse } from "next/server";
import { listScrapeResults } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") ?? "141jav";
  try {
    const rows = await listScrapeResults(source);
    const results = rows.map((r) => {
      const tags = r.tags ? r.tags.split(",").filter(Boolean) : [];
      let images: string[] = [];
      let mainImage = r.imageUrl;
      if (r.source === "pornrips" && r.imageUrl) {
        images = r.imageUrl.split(",").filter(Boolean);
        if (images.length > 0) mainImage = images[0];
      }
      return {
        id: r.id,
        source: r.source,
        title: r.title,
        image: mainImage,
        images,
        magnet: r.magnetLink,
        torrent: r.torrentLink,
        tags,
        is_downloaded: r.isDownloaded,
        is_hidden: r.isHidden,
        created_at: r.createdAt,
      };
    });
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Failed to list scrape results:", err);
    return NextResponse.json({ error: "Failed to list scrape results" }, { status: 500 });
  }
}
