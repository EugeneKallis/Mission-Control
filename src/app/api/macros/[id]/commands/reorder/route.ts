import { NextRequest, NextResponse } from "next/server";
import { getMacro, updateMacro } from "@/lib/db/queries";
import type { MacroCommand } from "@/types";
import { z } from "zod";

const reorderCommandsSchema = z.object({
  order: z.array(z.number().int().min(0)),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = reorderCommandsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const macro = await getMacro(Number(id));
    const commands: MacroCommand[] = JSON.parse(macro.commands || "[]");

    if (parsed.data.order.length !== commands.length) {
      return NextResponse.json({ error: "Invalid order array" }, { status: 400 });
    }

    // Reorder commands based on the provided index order
    const reordered = parsed.data.order.map((oldIndex) => ({
      ...commands[oldIndex],
      ord: 0,
    }));
    reordered.forEach((c, i) => { c.ord = i; });

    await updateMacro(Number(id), { commands: JSON.stringify(reordered) });
    return NextResponse.json(reordered);
  } catch (error) {
    console.error("Failed to reorder commands:", error);
    return NextResponse.json({ error: "Failed to reorder commands" }, { status: 500 });
  }
}
