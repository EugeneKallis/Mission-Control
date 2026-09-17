/**
 * GET /api/scraper/results?source=
 * Returns the visible (not hidden) scrape results for the given source.
 * Mirrors the Go APIScraperResults handler.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listScrapeResults } from "@/lib/db/queries";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const source = searchParams.get("source") ?? "141jav";
  const cursorCreatedAt = searchParams.get("cursorCreatedAt");
  const cursorId = searchParams.get("cursorId");
  const hasCursorCreatedAt = cursorCreatedAt !== null;
  const hasCursorId = cursorId !== null;

  if (hasCursorCreatedAt !== hasCursorId) {
    return NextResponse.json({ error: "Invalid pagination cursor" }, { status: 400 });
  }

  let before: { createdAt: Date; id: number } | undefined;
  if (hasCursorCreatedAt && hasCursorId) {
    const createdAt = new Date(cursorCreatedAt);
    const id = Number(cursorId);
    if (
      Number.isNaN(createdAt.getTime()) ||
      !/^[1-9]\d*$/.test(cursorId) ||
      !Number.isSafeInteger(id) ||
      id <= 0
    ) {
      return NextResponse.json({ error: "Invalid pagination cursor" }, { status: 400 });
    }
    before = { createdAt, id };
  }

  try {
    const [rows, groupedCounts] = await Promise.all([
      listScrapeResults(source, { limit: PAGE_SIZE + 1, before }),
      db.scrapeResult.groupBy({
        by: ["source"],
        where: { isHidden: false },
        _count: { _all: true },
      }),
    ]);
    const emittedRows = rows.slice(0, PAGE_SIZE);
    const results = emittedRows.map((r) => {
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
    const counts = Object.fromEntries(
      groupedCounts.map((row) => [row.source, row._count._all]),
    );
    const lastRow = emittedRows[PAGE_SIZE - 1];
    const nextCursor =
      rows.length > PAGE_SIZE && lastRow
        ? { createdAt: lastRow.createdAt.toISOString(), id: lastRow.id }
        : null;
    return NextResponse.json({ results, counts, nextCursor });
  } catch (err) {
    console.error("Failed to list scrape results:", err);
    return NextResponse.json({ error: "Failed to list scrape results" }, { status: 500 });
  }
}
