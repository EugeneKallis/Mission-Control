/**
 * GET  /api/bl-finder/config — read the current config.
 * PUT  /api/bl-finder/config — update one or more fields.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DEFAULT_BLFINDER_CONFIG,
  getBlFinderConfig,
  setBlFinderConfig,
} from "@/lib/db/queries";

const configSchema = z.object({
  enabled: z.boolean().optional(),
  intervalSec: z.number().int().min(1).max(24 * 60 * 60).optional(),
  batchSize: z.number().int().min(1).max(500).optional(),
  concurrency: z.number().int().min(1).max(32).optional(),
  timeoutSec: z.number().int().min(1).max(600).optional(),
  recheckAgeDays: z.number().int().min(0).max(365).optional(),
  discoverIntervalSec: z.number().int().min(0).max(7 * 24 * 60 * 60).optional(),
  mediaDirs: z.array(z.string()).optional(),
});

export async function GET() {
  try {
    const config = await getBlFinderConfig();
    return NextResponse.json({ config, defaults: DEFAULT_BLFINDER_CONFIG });
  } catch (err) {
    console.error("GET /api/bl-finder/config failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const config = await setBlFinderConfig(parsed.data);
    return NextResponse.json({ config });
  } catch (err) {
    console.error("PUT /api/bl-finder/config failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
