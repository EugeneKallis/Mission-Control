import { NextRequest, NextResponse } from "next/server";
import { getSidebarLayout, saveSidebarLayout } from "@/lib/sidebar-layout";

export async function GET() {
  try {
    return NextResponse.json(await getSidebarLayout());
  } catch {
    return NextResponse.json({ error: "Failed to load sidebar layout" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const saved = await saveSidebarLayout(await request.json());
    return NextResponse.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid sidebar layout";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
