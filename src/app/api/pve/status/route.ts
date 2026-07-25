/**
 * GET /api/pve/status
 *
 * Returns an aggregated snapshot of all enabled Proxmox endpoints (nodes +
 * guests + storage). Cached in-process for 15s (see @/lib/pve-status).
 */

import { NextResponse } from "next/server";
import { getClusterSnapshot } from "@/lib/pve-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getClusterSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("[pve] Failed to fetch cluster status:", error);
    return NextResponse.json(
      { error: "Failed to fetch Proxmox status" },
      { status: 500 },
    );
  }
}
