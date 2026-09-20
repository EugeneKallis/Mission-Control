/**
 * POST /api/scraper/download
 * Body: { id: number }
 * Submits the result's magnet or torrent bytes to Zurg, then marks it downloaded.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getScrapeResult,
  markScrapeResultDownloaded,
} from "@/lib/db/queries";
import { ZurgClient } from "@/lib/clients/zurg";
import { resolveConfig } from "@/lib/config";

const schema = z.object({ id: z.number().int().positive() });

/**
 * Reject internal / loopback / link-local / private IP ranges so a scraped
 * or user-submitted torrent URL can't be used as an SSRF vector.
 */
function isAllowedTorrentUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (hostname === "localhost" || hostname === "localhost.localdomain") return false;

    // IPv6 loopback, unspecified, unique-local, link-local, multicast, and
    // IPv4-mapped addresses. Reject mapped addresses outright so alternate
    // encodings cannot bypass the IPv4 private-range checks below.
    if (hostname === "::" || hostname === "::1") return false;
    if (hostname.startsWith("fc") || hostname.startsWith("fd")) return false;
    if (/^fe[89ab]/.test(hostname)) return false;
    if (hostname.startsWith("ff") || hostname.startsWith("::ffff:")) return false;

    // IPv4 checks
    const ipv4 = hostname;
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

    const cfg = await resolveConfig();
    const zurg = new ZurgClient(cfg.zurgUrl, cfg.zurgApiKey);
    const isRealMagnet = magnet ? magnet.startsWith("magnet:") : false;

    // Prefer the torrent file when the source provides both links. Real-Debrid
    // can fail to resolve otherwise-valid magnets with `magnet_error`, while
    // the .torrent contains the metadata it needs directly.
    if (torrent || (magnet && !isRealMagnet)) {
      const torrentUrl = torrent || magnet;
      if (!torrentUrl || !isAllowedTorrentUrl(torrentUrl)) {
        return NextResponse.json({ success: false, error: "Invalid torrent URL" }, { status: 400 });
      }
      const res = await fetch(torrentUrl, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        return NextResponse.json({ success: false, error: `Torrent unavailable: HTTP ${res.status}` }, { status: 502 });
      }
      const data = await res.arrayBuffer();
      await zurg.addTorrent(data, `${sanitizeFilename(item.title)}.torrent`);
    } else if (magnet && isRealMagnet) {
      await zurg.addMagnet(magnet);
    } else {
      return NextResponse.json({ success: false, error: "Invalid torrent or magnet link" }, { status: 400 });
    }

    await markScrapeResultDownloaded(parsed.data.id);
    return NextResponse.json({ success: true, id: parsed.data.id });
  } catch (err) {
    console.error("Failed to submit to Zurg:", err);
    return NextResponse.json({ success: false, error: "Failed to submit to Zurg" }, { status: 500 });
  }
}
