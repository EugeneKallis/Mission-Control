/**
 * POST /api/scraper/hide
 * Body: { id: number }
 * Marks a single scrape result as hidden.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hideScrapeResult } from "@/lib/db/queries";

const schema = z.object({ id: z.number().int().positive() });

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
    await hideScrapeResult(parsed.data.id);
    return NextResponse.json({ success: true, id: parsed.data.id });
  } catch (err) {
    console.error("Failed to hide scrape result:", err);
    return NextResponse.json({ error: "Failed to hide" }, { status: 500 });
  }
}
