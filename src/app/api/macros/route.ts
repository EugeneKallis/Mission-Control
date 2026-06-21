import { NextRequest, NextResponse } from "next/server";
import { getGroupedMacros, createMacro } from "@/lib/db/queries";
import { z } from "zod";

const createMacroSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().default(""),
  groupName: z.string().optional().default("Ungrouped"),
  ord: z.number().int().optional().default(0),
  runOnAgent: z.boolean().optional().default(false),
  agentHostname: z.string().optional().default(""),
  commands: z.string().optional().default("[]"),
});

export async function GET() {
  try {
    const grouped = await getGroupedMacros();
    return NextResponse.json(grouped);
  } catch (error) {
    console.error("Failed to fetch macros:", error);
    return NextResponse.json({ error: "Failed to fetch macros" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createMacroSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const macro = await createMacro(parsed.data);
    return NextResponse.json(macro, { status: 201 });
  } catch (error) {
    console.error("Failed to create macro:", error);
    return NextResponse.json({ error: "Failed to create macro" }, { status: 500 });
  }
}
