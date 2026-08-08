import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rm } from "fs/promises";
import {
  deleteDebridByPaths,
  getDebridChildren,
  getDebridFilesByPaths,
} from "@/lib/db/queries";
import { getConfig } from "@/lib/config";
import { resolveSafeDeletePath } from "@/lib/safe-delete";

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

    const selectedPaths = [...new Set(parsed.data.paths)];
    const indexed = await getDebridFilesByPaths(selectedPaths);
    if (indexed.length !== selectedPaths.length) {
      return NextResponse.json(
        { error: "Every path must exist in the Debrid index" },
        { status: 400 },
      );
    }

    // Expand dir selections to include all descendants so we delete the right rows
    // and remove the right files from disk.
    const allPaths = new Set<string>(selectedPaths);
    for (const p of selectedPaths) {
      const children = await getDebridChildren(p, 100000);
      for (const child of children) {
        allPaths.add(child.path);
      }
    }

    const mediaRoot = getConfig().mediaBasePath;
    const diskPaths = new Map<string, string>();
    for (const p of allPaths) {
      const diskPath = await resolveSafeDeletePath(mediaRoot, p);
      if (!diskPath) {
        return NextResponse.json(
          { error: "Path is outside the configured media root" },
          { status: 403 },
        );
      }
      diskPaths.set(p, diskPath);
    }

    // Best-effort disk deletion; missing paths are ignored.
    for (const [p, diskPath] of diskPaths) {
      try {
        await rm(diskPath, { recursive: true, force: true });
      } catch (err) {
        console.warn(`Failed to remove ${p} from disk:`, err);
      }
    }

    const result = await deleteDebridByPaths([...allPaths]);
    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error("Failed to delete debrid files:", error);
    return NextResponse.json(
      { error: "Failed to delete debrid files" },
      { status: 500 }
    );
  }
}
