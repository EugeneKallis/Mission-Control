/**
 * POST /api/scraper/undo
 * Body: { source: string } OR { id: number }
 * Un-hides a scrape result. The Go version either takes a source (re-show
 * the most-recently hidden result for that source) or a title. We support
 * both source and explicit id.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getLastHiddenScrapeResult,
  undoHideScrapeResult,
} from "@/lib/db/queries";

const schema = z.union([
  z.object({ source: z.string().min(1) }),
  z.object({ id: z.number().int().positive() }),
]);

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

  try {
    if ("id" in parsed.data) {
      await undoHideScrapeResult(parsed.data.id);
      return NextResponse.json({ success: true, id: parsed.data.id });
    }
    const item = await getLastHiddenScrapeResult(parsed.data.source);
    if (!item) {
      return NextResponse.json({ error: "No hidden items to undo" }, { status: 404 });
    }
    await undoHideScrapeResult(item.id);
    return NextResponse.json({ success: true, id: item.id });
  } catch (err) {
    console.error("Failed to undo hide:", err);
    return NextResponse.json({ error: "Failed to undo hide" }, { status: 500 });
  }
}
