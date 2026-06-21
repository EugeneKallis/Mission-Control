/**
 * POST /api/scraper/refresh
 * Body: { source?: string }
 * Clear & rescrape — deletes non-downloaded rows for the source (or all),
 * then kicks the worker in the background.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteAllScrapeResults,
  deleteScrapeResultsBySource,
} from "@/lib/db/queries";
import { triggerSourceInBackground } from "@/workers/scraper-runner";

const schema = z.object({
  source: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body is OK — clear all
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.source) {
      await deleteScrapeResultsBySource(parsed.data.source);
      // The schema only allows valid sources through (string is just for the API shape).
      const src = parsed.data.source as "141jav" | "projectjav" | "pornrips";
      triggerSourceInBackground(src);
      return NextResponse.json({ success: true, source: parsed.data.source });
    }
    await deleteAllScrapeResults();
    // When source is omitted, kick the first two (matches Go: 141jav + projectjav)
    triggerSourceInBackground("141jav");
    triggerSourceInBackground("projectjav");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to refresh scraper results:", err);
    return NextResponse.json({ error: "Failed to refresh" }, { status: 500 });
  }
}
