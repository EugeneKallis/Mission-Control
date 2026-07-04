import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export async function GET() {
  try {
    const instances = getConfig().arrInstances;
    const map: Record<string, string> = {};
    for (const inst of instances) {
      if (inst.name && inst.url) map[inst.name] = inst.url;
    }
    return NextResponse.json(map);
  } catch (error) {
    console.error("Failed to build arr instance map:", error);
    return NextResponse.json(
      { error: "Failed to build arr instance map" },
      { status: 500 }
    );
  }
}
