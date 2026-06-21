/**
 * POST /api/scraper/trigger
 * Body: { source: "141jav" | "projectjav" | "pornrips" }
 * Triggers a scrape of the given source in the background.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { triggerSourceInBackground } from "@/workers/scraper-runner";
import { getScrapingStatus } from "@/workers/scrapers/status";

const schema = z.object({
  source: z.enum(["141jav", "projectjav", "pornrips"]),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Don't double-trigger; the original Go handler just spawns a goroutine
  // which is the same here. We check the status flag as a soft guard.
  const already = await getScrapingStatus(parsed.data.source);
  if (already) {
    return NextResponse.json(
      { success: true, already_running: true, source: parsed.data.source },
      { status: 200 }
    );
  }

  triggerSourceInBackground(parsed.data.source);
  return NextResponse.json({ success: true, source: parsed.data.source });
}
