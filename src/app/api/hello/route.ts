/**
 * Example API route — backend endpoint
 *
 * GET /api/hello
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    message: "Hello from Mission Control!",
    timestamp: new Date().toISOString(),
  });
}
