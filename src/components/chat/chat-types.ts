/**
 * Shared types for the chat page.
 *
 * Sessions + messages are DB-backed (see /api/chat/sessions). Each session
 * stores the composite model id ("provider/modelId") it uses, so a session
 * remembers its model across reloads.
 */

export interface AttachmentMeta {
  name: string;
  mimeType: string;
  size: number;
  /** "text" | "image" | "unsupported" — persisted metadata only. */
  category: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  attachments: AttachmentMeta[];
  createdAt: string;
}

export interface ChatSessionSummary {
  id: number;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ChatMessage[];
}

/**
 * A pending attachment read client-side. Only metadata is persisted to the
 * DB; the `text` / `dataUrl` content is sent to the provider in the request
 * that created the message and then discarded.
 */
export interface PendingAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** "text" (inlinable), "image" (needs vision), or "unsupported" (kept
   *  only for the warning UI — never sent). */
  kind: "text" | "image" | "unsupported";
  text?: string;
  dataUrl?: string;
  truncated?: boolean;
}

/** A model entry from GET /api/chat/models (already price-sorted). */
export interface ModelEntry {
  id: string;
  modelId: string;
  provider: string;
  providerLabel: string;
  name: string;
  inputPricePerM: number;
  outputPricePerM: number;
  contextWindow: number;
  maxOutput: number;
  capabilities: string[];
  chips: { key: string; label: string; icon: string }[];
  price: string;
  configured: boolean;
}

export interface ModelsResponse {
  defaultModelId: string;
  models: ModelEntry[];
}

/** Required body for POST /api/chat/sessions/[id]/messages. */
export interface SendMessageBody {
  content: string;
  attachments: {
    name: string;
    mimeType: string;
    size: number;
    kind: "text" | "image";
    text?: string;
    dataUrl?: string;
  }[];
}