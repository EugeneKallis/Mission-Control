import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

const reorderMacrosSchema = z.object({
  groupId: z.number().int().positive().optional(),
  macroIds: z.array(z.number().int().positive()),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = reorderMacrosSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { groupId, macroIds } = parsed.data;

    // Get the group name
    let groupName = "Ungrouped";
    if (groupId) {
      const group = await db.macroGroup.findUnique({ where: { id: groupId } });
      if (group) groupName = group.name;
    }

    // Update each macro's group and ord
    for (let i = 0; i < macroIds.length; i++) {
      await db.macro.update({
        where: { id: macroIds[i] },
        data: { groupName, ord: i },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to reorder macros:", error);
    return NextResponse.json({ error: "Failed to reorder macros" }, { status: 500 });
  }
}
