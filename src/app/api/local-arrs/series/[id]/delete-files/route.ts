import { NextRequest, NextResponse } from "next/server";
import { ArrClient } from "@/lib/clients/arr";
import { noStore, parseSeriesId, resolveLocalArrClient, validSonarrSlug } from "../../../_shared";

export const dynamic = "force-dynamic";

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

  const resolved = await resolveLocalArrClient(slug);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status, headers: noStore });
  }

  try {
    const client: ArrClient = resolved.client;
    const files = await client.listEpisodeFiles(seriesId);
    await client.bulkDeleteEpisodeFiles(files.map((file) => file.id));
    return NextResponse.json({ seriesId, deleted: files.length }, { headers: noStore });
  } catch (error) {
    console.error("[local-arrs] deleteFiles failed:", error);
    return NextResponse.json({ error: "Failed to delete files" }, { status: 502, headers: noStore });
  }
}