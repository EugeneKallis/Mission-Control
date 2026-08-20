import { NextRequest, NextResponse } from "next/server";
import { ArrClient } from "@/lib/clients/arr";
import { noStore, parseSeriesId, resolveLocalArrClient, validSonarrSlug } from "../../../_shared";

export const dynamic = "force-dynamic";

/**
 * Match the two UI operations as one server request. Monitoring changes first
 * so deleting the files cannot immediately trigger downloads for aired episodes.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const seriesId = parseSeriesId(rawId);
  if (seriesId === null) {
    return NextResponse.json({ error: "Invalid series id" }, { status: 400, headers: noStore });
  }

  const slug = validSonarrSlug(request.nextUrl.searchParams.get("instance"));
  if (!slug) {
    return NextResponse.json({ error: "Unknown local Sonarr instance" }, { status: 400, headers: noStore });
  }

  const resolved = await resolveLocalArrClient(slug);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status, headers: noStore });
  }

  const client: ArrClient = resolved.client;
  try {
    await client.setSeriesMonitoring(seriesId, "future");
  } catch (error) {
    console.error("[local-arrs] combined monitoring update failed:", error);
    return NextResponse.json({ error: "Failed to set monitoring; files were not deleted" }, { status: 502, headers: noStore });
  }

  try {
    const files = await client.listEpisodeFiles(seriesId);
    if (files.length > 0) {
      await client.bulkDeleteEpisodeFiles(files.map((file) => file.id));
    }
    return NextResponse.json({ seriesId, monitor: "future", deleted: files.length }, { headers: noStore });
  } catch (error) {
    console.error("[local-arrs] combined file deletion failed:", error);
    return NextResponse.json(
      { error: "Monitoring changed to future, but files could not be deleted", monitoringUpdated: true },
      { status: 502, headers: noStore },
    );
  }
}
