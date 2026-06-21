import { NextRequest, NextResponse } from "next/server";
import {
  getDebridRootFiles,
  getDebridChildren,
} from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  try {
    const parent = request.nextUrl.searchParams.get("parent") ?? "";
    const files =
      parent === "" ? await getDebridRootFiles() : await getDebridChildren(parent);
    return NextResponse.json(files);
  } catch (error) {
    console.error("Failed to fetch debrid tree:", error);
    return NextResponse.json(
      { error: "Failed to fetch debrid tree" },
      { status: 500 }
    );
  }
}
