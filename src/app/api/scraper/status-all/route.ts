/**
 * GET /api/scraper/status-all
 * Returns whether any source is currently scraping.
 */

import { NextResponse } from "next/server";
import { getAllScrapingStatuses } from "@/workers/scrapers/status";

export async function GET() {
  try {
    const all = await getAllScrapingStatuses();
    const isScraping = Object.values(all).some(Boolean);
    return NextResponse.json({ is_scraping: isScraping, sources: all });
  } catch (err) {
    console.error("Failed to read scraper status-all:", err);
    return NextResponse.json({ is_scraping: false, sources: {} }, { status: 500 });
  }
}
