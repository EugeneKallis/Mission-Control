import { NextResponse } from "next/server";
import { getArrInstanceMap } from "@/lib/arr-map";

export async function GET() {
  try {
    const map = getArrInstanceMap();
    return NextResponse.json(map);
  } catch (error) {
    console.error("Failed to build arr instance map:", error);
    return NextResponse.json(
      { error: "Failed to build arr instance map" },
      { status: 500 }
    );
  }
}
