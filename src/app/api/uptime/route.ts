/**
 * GET /api/uptime
 * Returns the server process uptime formatted as a human-readable string.
 */

import { NextResponse } from "next/server";
import { formatSeconds } from "@/lib/format";

export async function GET() {
  const seconds = process.uptime();
  return NextResponse.json({
    uptime: formatSeconds(seconds),
    seconds: Math.floor(seconds),
  });
}
