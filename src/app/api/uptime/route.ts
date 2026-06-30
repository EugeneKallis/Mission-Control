/**
 * GET /api/uptime
 * Returns the server process uptime formatted as a human-readable string.
 */

import { NextResponse } from "next/server";
import { formatUptime } from "@/lib/uptime";

export async function GET() {
  const seconds = process.uptime();
  return NextResponse.json({
    uptime: formatUptime(seconds),
    seconds: Math.floor(seconds),
  });
}
