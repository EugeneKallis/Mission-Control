import { NextRequest, NextResponse } from "next/server";
import { listMacroGroups, createMacroGroup, getGroupedMacros } from "@/lib/db/queries";
import { z } from "zod";

const createGroupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  ord: z.number().int().optional().default(0),
});

export async function GET() {
  try {
    const groups = await listMacroGroups();
    return NextResponse.json(groups);
  } catch (error) {
    console.error("Failed to fetch groups:", error);
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const group = await createMacroGroup(parsed.data.name, parsed.data.ord);
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("Failed to create group:", error);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
