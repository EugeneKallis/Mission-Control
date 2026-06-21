import { NextRequest, NextResponse } from "next/server";
import {
  getNzbRootFiles,
  getNzbChildren,
} from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const parent = request.nextUrl.searchParams.get("parent") ?? "";
    const files = parent === "" ? await getNzbRootFiles() : await getNzbChildren(parent);
    return NextResponse.json(files);
  } catch (error) {
    console.error("Failed to fetch NZB tree:", error);
    return NextResponse.json(
      { error: "Failed to fetch NZB tree" },
      { status: 500 }
    );
  }
}
