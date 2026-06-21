/**
 * POST /api/scraper/hide-all
 * Body: { source?: string }
 * Hides every visible (not downloaded) result, optionally scoped to a
 * single source.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hideAllScrapeResults, hideScrapeResultsBySource } from "@/lib/db/queries";

const schema = z.object({
  source: z.enum(["141jav", "projectjav", "pornrips"]).optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body is OK — hide all
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
      const result = await hideScrapeResultsBySource(parsed.data.source);
      return NextResponse.json({ success: true, hidden: result.count, source: parsed.data.source });
    }
    const result = await hideAllScrapeResults();
    return NextResponse.json({ success: true, hidden: result.count });
  } catch (err) {
    console.error("Failed to hide all:", err);
    return NextResponse.json({ error: "Failed to hide all" }, { status: 500 });
  }
}
