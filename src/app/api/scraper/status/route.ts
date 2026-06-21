/**
 * GET /api/scraper/status?source=
 * Returns the current scraping status for one source.
 */

import { NextRequest, NextResponse } from "next/server";
import { getScrapingStatus } from "@/workers/scrapers/status";

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") ?? "141jav";
  try {
    const isScraping = await getScrapingStatus(source);
    return NextResponse.json({ is_scraping: isScraping, source });
  } catch (err) {
    console.error("Failed to read scraper status:", err);
    return NextResponse.json({ is_scraping: false, source }, { status: 500 });
  }
}
