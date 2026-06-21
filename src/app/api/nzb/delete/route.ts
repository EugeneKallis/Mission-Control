import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rm } from "fs/promises";
import {
  deleteNzbByPaths,
  getNzbChildren,
} from "@/lib/db/queries";

const deleteSchema = z.object({
  paths: z.array(z.string().min(1)).min(1, "At least one path is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Expand dir selections to include all descendants so we delete the right rows
    // and remove the right files from disk.
    const selectedPaths = parsed.data.paths;
    const allPaths = new Set<string>(selectedPaths);
    for (const p of selectedPaths) {
      const children = await getNzbChildren(p, 100000);
      for (const child of children) {
        allPaths.add(child.path);
      }
    }

    // Best-effort disk deletion; missing paths are ignored.
    for (const p of allPaths) {
      try {
        await rm(p, { recursive: true, force: true });
      } catch (err) {
        console.warn(`Failed to remove ${p} from disk:`, err);
      }
    }

    const result = await deleteNzbByPaths([...allPaths]);
    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error("Failed to delete NZB files:", error);
    return NextResponse.json(
      { error: "Failed to delete NZB files" },
      { status: 500 }
    );
  }
}
