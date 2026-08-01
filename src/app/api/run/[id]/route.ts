import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runMacro } from "@/lib/runner";
import { claimInternalMacro } from "@/lib/db/queries";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid macro ID"),
});

/**
 * POST /api/run/[id]
 * Triggers a macro and returns immediately. Output streams over SSE (/api/ws).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = paramsSchema.safeParse({ id });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid macro ID", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const claim = await claimInternalMacro(parsed.data.id);
  if (claim === "consumed") {
    return NextResponse.json(
      { error: "This generated action has already been used" },
      { status: 409 },
    );
  }

  // Fire-and-forget: don't await — runMacro streams via the bus
  runMacro(parsed.data.id, "user").catch((err) => {
    console.error(`[runMacro] Unhandled runner error for macro ${parsed.data.id}:`, err);
  });

  return NextResponse.json({ ok: true, macroId: parsed.data.id });
}
