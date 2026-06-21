import { NextRequest, NextResponse } from "next/server";
import { getMacro, updateMacro } from "@/lib/db/queries";
import type { MacroCommand } from "@/types";
import { z } from "zod";

const addCommandSchema = z.object({
  ord: z.number().int().optional(),
  cmd: z.string().min(1, "Command is required"),
  working_dir: z.string().optional(),
});

const editCommandSchema = z.object({
  index: z.number().int().min(0).optional(),
  ord: z.number().int().optional(),
  cmd: z.string().min(1).optional(),
  working_dir: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const macro = await getMacro(Number(id));
    const commands: MacroCommand[] = JSON.parse(macro.commands || "[]");
    return NextResponse.json(commands);
  } catch {
    return NextResponse.json({ error: "Macro not found" }, { status: 404 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = addCommandSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const macro = await getMacro(Number(id));
    const commands: MacroCommand[] = JSON.parse(macro.commands || "[]");

    const newCmd: MacroCommand = {
      ord: parsed.data.ord ?? commands.length,
      cmd: parsed.data.cmd,
      working_dir: parsed.data.working_dir,
    };
    commands.push(newCmd);

    await updateMacro(Number(id), { commands: JSON.stringify(commands) });
    return NextResponse.json(newCmd, { status: 201 });
  } catch (error) {
    console.error("Failed to add command:", error);
    return NextResponse.json({ error: "Failed to add command" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const parsed = editCommandSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const macro = await getMacro(Number(id));
    const commands: MacroCommand[] = JSON.parse(macro.commands || "[]");

    const index = parsed.data.index ?? -1;
    if (index < 0 || index >= commands.length) {
      return NextResponse.json({ error: "Invalid command index" }, { status: 400 });
    }

    commands[index] = {
      ...commands[index],
      cmd: parsed.data.cmd ?? commands[index].cmd,
      working_dir: parsed.data.working_dir !== undefined ? parsed.data.working_dir : commands[index].working_dir,
    };

    await updateMacro(Number(id), { commands: JSON.stringify(commands) });
    return NextResponse.json(commands[index]);
  } catch (error) {
    console.error("Failed to update command:", error);
    return NextResponse.json({ error: "Failed to update command" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const index = Number(url.searchParams.get("index"));

  try {
    const macro = await getMacro(Number(id));
    const commands: MacroCommand[] = JSON.parse(macro.commands || "[]");

    if (isNaN(index) || index < 0 || index >= commands.length) {
      return NextResponse.json({ error: "Invalid command index" }, { status: 400 });
    }

    commands.splice(index, 1);
    // Re-index
    commands.forEach((c, i) => { c.ord = i; });

    await updateMacro(Number(id), { commands: JSON.stringify(commands) });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete command:", error);
    return NextResponse.json({ error: "Failed to delete command" }, { status: 500 });
  }
}
