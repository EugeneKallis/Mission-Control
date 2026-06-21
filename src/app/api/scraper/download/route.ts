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

/**
 * Reject internal / loopback / link-local / private IP ranges so a scraped
 * or user-submitted torrent URL can't be used as an SSRF vector.
 */
function isAllowedTorrentUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "localhost.localdomain") return false;

    // IPv6 loopback / unique-local
    if (hostname === "::1" || hostname === "[::1]") return false;
    if (hostname.startsWith("fc") || hostname.startsWith("fd")) return false;
    if (hostname.startsWith("fe80:")) return false;

    // IPv4 checks
    const ipv4 = hostname.replace(/\[|\]/g, "");
    if (ipv4 === "127.0.0.1" || ipv4.startsWith("127.")) return false;

    const parts = ipv4.split(".").map(Number);
    if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
      if (parts[0] === 10) return false; // 10/8
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false; // 172.16/12
      if (parts[0] === 192 && parts[1] === 168) return false; // 192.168/16
      if (parts[0] === 169 && parts[1] === 254) return false; // link-local
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Strip path separators, control chars, and other unsafe filename characters
 * from the scraped title before using it as a multipart filename.
 */
function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[\/\\:]/g, "_")
    .replace(/[<>'"|?*]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
}

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
      if (!isAllowedTorrentUrl(torrent)) {
        return NextResponse.json(
          { success: false, error: "Invalid torrent URL" },
          { status: 400 }
        );
      }
      // Fetch the .torrent file, then submit the bytes.
      const res = await fetch(torrent, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: `Torrent unavailable: HTTP ${res.status}` },
          { status: 502 }
        );
      }
      const data = await res.arrayBuffer();
      const filename = `${sanitizeFilename(item.title)}.torrent`;
      await decypharr.addTorrent(data, filename);
    }

    await markScrapeResultDownloaded(parsed.data.id);
    return NextResponse.json({ success: true, id: parsed.data.id });
  } catch (err) {
    console.error("Failed to submit to Decypharr:", err);
    return NextResponse.json(
      { success: false, error: "Failed to submit to Decypharr" },
      { status: 500 }
    );
  }
}
