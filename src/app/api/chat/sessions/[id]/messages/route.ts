/**
 * POST /api/chat/sessions/[id]/messages — send a user message to the
 * session's model and persist the conversation.
 *
 * Body: {
 *   content: string,
 *   attachments?: Array<{
 *     name: string, mimeType: string, size: number,
 *     kind: "text" | "image",
 *     text?: string,        // for kind === "text" (inlined into the prompt)
 *     dataUrl?: string,     // for kind === "image" (base64 data URL)
 *   }>
 * }
 *
 * The session's stored `model` decides which provider is called. Upload the
 * model before sending (PATCH /api/chat/sessions/[id]); that is how a
 * session "remembers" its model.
 *
 * Unsupported attachments are rejected with 400 so the client can surface
 * the warning (the client also blocks them, this is defense in depth).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getChatSession,
  addChatMessage,
  touchChatSession,
  type ChatAttachmentMeta,
} from "@/lib/db/queries";
import type { ChatMessage as PrismaMessage } from "@prisma/client";

/** Map a raw Prisma ChatMessage to the shape the frontend expects. */
function toMsgShape(m: PrismaMessage) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    attachments: JSON.parse(m.attachmentsJson) as ChatAttachmentMeta[],
    createdAt: m.createdAt.toISOString(),
  };
}
import {
  getModel,
  categorizeAttachment,
  attachmentSupported,
} from "@/lib/chat/models";
import {
  callProvider,
  providerErrorToResponse,
  type ProviderMessage,
} from "@/lib/chat/provider";

const SYSTEM_PROMPT =
  "You are a helpful assistant for Mission Control, a server management dashboard. Be concise and practical.";

const attachmentSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  kind: z.enum(["text", "image"]),
  text: z.string().optional(),
  dataUrl: z.string().optional(),
});

const sendSchema = z.object({
  content: z.string().min(1).max(64_000),
  attachments: z.array(attachmentSchema).max(12).optional(),
});

/** Max prior messages to feed the model for context. */
const MAX_HISTORY = 50;

function buildUserContent(content: string, attachments: z.infer<typeof attachmentSchema>[]): { text: string; images: string[] } {
  let text = content;
  const images: string[] = [];
  for (const a of attachments) {
    if (a.kind === "text") {
      const body = a.text ?? "";
      text += `\n\n### File: ${a.name}\n\`\`\`\n${body}\n\`\`\``;
    } else if (a.kind === "image" && a.dataUrl) {
      images.push(a.dataUrl);
    }
  }
  return { text, images };
}

export async function POST(
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

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const sid = Number(id);
    const session = await getChatSession(sid);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const model = getModel(session.model);
    if (!model) {
      return NextResponse.json(
        { error: `Session references unknown model: ${session.model}` },
        { status: 500 },
      );
    }

    // Defense in depth: verify every attachment is ingestible by this model.
    const attachments = parsed.data.attachments ?? [];
    for (const a of attachments) {
      const category = categorizeAttachment(a);
      if (!attachmentSupported(model, category)) {
        return NextResponse.json(
          {
            error:
              category === "image"
                ? `${model.name} can't read images (no vision support). Pick a Vision-capable model or remove the attachment.`
                : `${model.name} can't read ${a.mimeType || a.name} files.`,
          },
          { status: 400 },
        );
      }
    }

    // Persist the user message (metadata only — no base64 bodies in the DB).
    const attachmentMeta: ChatAttachmentMeta[] = attachments.map((a) => ({
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      category: a.kind,
    }));
    const userMsg = await addChatMessage({
      sessionId: sid,
      role: "user",
      content: parsed.data.content,
      attachments: attachmentMeta,
    });

    // Build provider messages: system + history (text only) + new user msg.
    const history: ProviderMessage[] = [];
    const prior = session.messages.slice(-MAX_HISTORY);
    for (const m of prior) {
      history.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
    }
    const { text, images } = buildUserContent(parsed.data.content, attachments);
    const providerMessages: ProviderMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: text, images: images.length ? images : undefined },
    ];

    let assistantContent: string;
    try {
      assistantContent = await callProvider({ model, messages: providerMessages });
    } catch (err) {
      // Even on failure we keep the user message persisted. Surface the
      // error text as an assistant turn so the chat shows what went wrong.
      const msg = err instanceof Error ? err.message : "Unknown error";
      assistantContent = `_⚠️ Could not get a response: ${msg}_`;
      const assistantMsg = await addChatMessage({
        sessionId: sid,
        role: "assistant",
        content: assistantContent,
      });
      await touchChatSession(sid);
      return NextResponse.json({
        userMessage: toMsgShape(userMsg),
        assistantMessage: toMsgShape(assistantMsg),
        error: msg,
      });
    }

    const assistantMsg = await addChatMessage({
      sessionId: sid,
      role: "assistant",
      content: assistantContent || "(no response)",
    });
    await touchChatSession(sid);

    return NextResponse.json(
      { userMessage: toMsgShape(userMsg), assistantMessage: toMsgShape(assistantMsg) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to send chat message:", error);
    return NextResponse.json(
      { error: "Failed to send chat message" },
      { status: 500 },
    );
  }
}