/**
 * POST /api/scraper/download
 * Body: { id: number }
 * Submits the result's magnet (or torrent) to Decypharr, marks the
 * result downloaded + hidden.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getScrapeResult,
  markScrapeResultDownloaded,
} from "@/lib/db/queries";
import { DecypharrClient } from "@/lib/clients/decypharr";
import { getConfig } from "@/lib/config";

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
    const item = await getScrapeResult(parsed.data.id);
    const magnet = item.magnetLink;
    const torrent = item.torrentLink;

    if (!magnet && !torrent) {
      return NextResponse.json(
        { success: false, error: "No magnet or torrent link" },
        { status: 400 }
      );
    }

    const cfg = getConfig();
    const decypharr = new DecypharrClient(cfg.decypharrUrl);

    if (magnet) {
      await decypharr.addMagnet(magnet);
    } else if (torrent) {
      // Fetch the .torrent file, then submit the bytes.
      const res = await fetch(torrent);
      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: `Torrent unavailable: HTTP ${res.status}` },
          { status: 502 }
        );
      }
      const data = await res.arrayBuffer();
      const filename = `${item.title}.torrent`;
      await decypharr.addTorrent(data, filename);
    }

    await markScrapeResultDownloaded(parsed.data.id);
    return NextResponse.json({ success: true, id: parsed.data.id });
  } catch (err) {
    console.error("Failed to submit to Decypharr:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Download failed" },
      { status: 500 }
    );
  }
}
