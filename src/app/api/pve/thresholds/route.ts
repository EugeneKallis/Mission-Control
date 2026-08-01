/**
 * GET /api/pve/thresholds  — read current utilization thresholds
 * PUT /api/pve/thresholds  — update one or more thresholds
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_PVE_THRESHOLDS } from "@/lib/pve-alerts";
import { getPveThresholds, setPveThresholds } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const thresholdsSchema = z.object({
  cpu: z.number().int().min(1).max(100).optional(),
  memory: z.number().int().min(1).max(100).optional(),
  storage: z.number().int().min(1).max(100).optional(),
}).strict();

export async function GET() {
  try {
    const config = await getPveThresholds();
    return NextResponse.json({ config, defaults: DEFAULT_PVE_THRESHOLDS });
  } catch (err) {
    console.error("GET /api/pve/thresholds failed:", err);
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

  const parsed = thresholdsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "At least one threshold must be provided" },
      { status: 400 },
    );
  }

  try {
    const config = await setPveThresholds(parsed.data);
    return NextResponse.json({ config });
  } catch (err) {
    console.error("PUT /api/pve/thresholds failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
