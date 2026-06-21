import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runMacro } from "@/lib/runner";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid macro ID"),
});

/**
 * POST /api/run/[id]
 * Triggers a macro and returns immediately. Output streams over SSE (/api/ws).
 *
 * Query params:
 *   ?agent=hostname   — override agent hostname for "Run on Agent" macros
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

  const agent = request.nextUrl.searchParams.get("agent") || undefined;

  // Fire-and-forget: don't await — runMacro streams via the bus
  runMacro(parsed.data.id, "user", agent).catch((err) => {
    console.error(`[runMacro] Unhandled runner error for macro ${parsed.data.id}:`, err);
  });

  return NextResponse.json({ ok: true, macroId: parsed.data.id });
}
