/**
 * POST /api/scraper/trigger-all
 * Triggers a scrape of every source in the background.
 */

import { NextResponse } from "next/server";
import { triggerAllSourcesInBackground } from "@/workers/scraper-runner";

export async function POST() {
  triggerAllSourcesInBackground();
  return NextResponse.json({ success: true });
}
