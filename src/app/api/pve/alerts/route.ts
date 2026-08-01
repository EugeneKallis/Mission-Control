/**
 * GET /api/pve/alerts
 *
 * Returns the count of Proxmox resources (running VMs + running LXC +
 * storage pools) whose utilization exceeds the configured thresholds.
 * Uses the in-process 15s snapshot cache so sidebar badge polling does
 * not generate extra Proxmox API calls.
 */

import { NextResponse } from "next/server";
import { getClusterSnapshot } from "@/lib/pve-status";
import { getPveThresholds } from "@/lib/db/queries";
import { countPveAlerts } from "@/lib/pve-alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [snapshot, thresholds] = await Promise.all([
      getClusterSnapshot(),
      getPveThresholds(),
    ]);
    const summary = countPveAlerts(snapshot.endpoints, thresholds);
    return NextResponse.json({ count: summary.count, thresholds });
  } catch (error) {
    console.error("GET /api/pve/alerts failed:", error);
    return NextResponse.json({ error: "Failed to compute PVE alerts" }, { status: 500 });
  }
}
