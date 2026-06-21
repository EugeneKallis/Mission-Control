import { NextRequest, NextResponse } from "next/server";
import { getMacro, updateMacro, deleteMacro } from "@/lib/db/queries";
import { z } from "zod";

const updateMacroSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  groupName: z.string().optional(),
  ord: z.number().int().optional(),
  runOnAgent: z.boolean().optional(),
  agentHostname: z.string().optional(),
  commands: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const macro = await getMacro(Number(id));
    return NextResponse.json(macro);
  } catch (error) {
    const isNotFound =
      error instanceof Error &&
      (error.message.includes("findUniqueOrThrow") || error.message.includes("Record to"));
    if (isNotFound) {
      return NextResponse.json({ error: "Macro not found" }, { status: 404 });
    }
    console.error("Failed to fetch macro:", error);
    return NextResponse.json({ error: "Failed to fetch macro" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = updateMacroSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const macro = await updateMacro(Number(id), parsed.data);
    return NextResponse.json(macro);
  } catch (error) {
    console.error("Failed to update macro:", error);
    return NextResponse.json({ error: "Failed to update macro" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await deleteMacro(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete macro:", error);
    return NextResponse.json({ error: "Failed to delete macro" }, { status: 500 });
  }
}
