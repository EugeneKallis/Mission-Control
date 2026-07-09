/**
 * GET   /api/chat/sessions/[id] — session with its messages
 * PATCH /api/chat/sessions/[id] — update title and/or model ("session remembers
 *                                 its model"); changing the model is validated
 *                                 against the catalog.
 * DELETE /api/chat/sessions/[id] — delete session + cascade messages
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getChatSession,
  updateChatSession,
  deleteChatSession,
  type ChatAttachmentMeta,
} from "@/lib/db/queries";
import { getModel } from "@/lib/chat/models";

const updateSchema = z.object({
  title: z.string().trim().max(200).optional(),
  model: z.string().trim().max(120).optional(),
});

function notFound() {
  return NextResponse.json({ error: "Session not found" }, { status: 404 });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const session = await getChatSession(Number(id));
    if (!session) return notFound();
    // Hydrate attachment metadata JSON.
    const messages = session.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      attachments: JSON.parse(m.attachmentsJson) as ChatAttachmentMeta[],
      createdAt: m.createdAt,
    }));
    return NextResponse.json({
      id: session.id,
      title: session.title,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages,
    });
  } catch (error) {
    console.error("Failed to fetch chat session:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat session" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.model && !getModel(parsed.data.model)) {
    return NextResponse.json(
      { error: `Unknown model: ${parsed.data.model}` },
      { status: 400 },
    );
  }

  try {
    const sid = Number(id);
    const existing = await getChatSession(sid);
    if (!existing) return notFound();
    const updated = await updateChatSession(sid, parsed.data);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update chat session:", error);
    return NextResponse.json(
      { error: "Failed to update chat session" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteChatSession(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const isNotFound =
      error instanceof Error && error.message.includes("Record to");
    if (isNotFound) return notFound();
    console.error("Failed to delete chat session:", error);
    return NextResponse.json(
      { error: "Failed to delete chat session" },
      { status: 500 },
    );
  }
}