import { NextRequest, NextResponse } from "next/server";
import { ArrClient, type SonarrMonitorType } from "@/lib/clients/arr";
import { noStore, parseSeriesId, resolveLocalArrClient, validSonarrSlug } from "../../../_shared";

export const dynamic = "force-dynamic";

const VALID_MONITORS: readonly SonarrMonitorType[] = ["all", "future", "missing", "existing", "firstSeason", "latestSeason", "none"];

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const seriesId = parseSeriesId(rawId);
  if (seriesId === null) {
    return NextResponse.json({ error: "Invalid series id" }, { status: 400, headers: noStore });
  }

  const slug = validSonarrSlug(request.nextUrl.searchParams.get("instance"));
  if (!slug) {
    return NextResponse.json({ error: "Unknown local Arr instance" }, { status: 400, headers: noStore });
  }

  const body = await request.json().catch(() => ({}));
  const monitor = typeof body?.monitor === "string" ? body.monitor : null;
  if (!monitor || !VALID_MONITORS.includes(monitor as SonarrMonitorType)) {
    return NextResponse.json({ error: "Unknown monitor option" }, { status: 400, headers: noStore });
  }

  const resolved = await resolveLocalArrClient(slug);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status, headers: noStore });
  }

  try {
    const client: ArrClient = resolved.client;
    await client.setSeriesMonitoring(seriesId, monitor as SonarrMonitorType);
    return NextResponse.json({ seriesId, monitor }, { headers: noStore });
  } catch (error) {
    console.error(`[local-arrs] setSeriesMonitoring failed:`, error);
    return NextResponse.json({ error: `Failed to set monitoring` }, { status: 502, headers: noStore });
  }
}