/**
 * GET  /api/chat/sessions — list chat sessions (id, title, model, timestamps)
 * POST /api/chat/sessions — create a new session, defaulting its model to
 *                           opencode-go/deepseek-v4-flash when none is given.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listChatSessions,
  createChatSession,
} from "@/lib/db/queries";
import {
  DEFAULT_MODEL_ID,
  getModel,
} from "@/lib/chat/models";

const createSchema = z.object({
  title: z.string().trim().max(200).optional(),
  model: z.string().trim().max(120).optional(),
});

export async function GET() {
  try {
    const sessions = await listChatSessions();
    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Failed to list chat sessions:", error);
    return NextResponse.json(
      { error: "Failed to list chat sessions" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const model = parsed.data.model ?? DEFAULT_MODEL_ID;
  if (!getModel(model)) {
    return NextResponse.json(
      { error: `Unknown model: ${model}` },
      { status: 400 },
    );
  }

  try {
    const session = await createChatSession({
      title: parsed.data.title,
      model,
    });
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Failed to create chat session:", error);
    return NextResponse.json(
      { error: "Failed to create chat session" },
      { status: 500 },
    );
  }
}