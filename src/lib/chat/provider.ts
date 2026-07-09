/**
 * Provider call layer — builds + sends a chat completion request to the
 * selected model's endpoint (OpenAI-compatible or Anthropic-compatible)
 * and returns the assistant text.
 *
 * Pure-ish: takes an injectable `fetch` so tests can stub it without
 * touching the network. No DB, no globals.
 */

import { NextResponse } from "next/server";
import type { ApiStyle, ChatModel } from "./models";
import { getProvider, resolveApiKey } from "./models";

/** Minimal fetch shape used by callProvider (avoids undici's `preconnect`). */
export type ChatFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** A message in the simplified shape the route hands to the provider. */
export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Inline image attachments (base64 data URLs) for vision models. */
  images?: string[];
}

export interface CallProviderOptions {
  model: ChatModel;
  messages: ProviderMessage[];
  apiKey?: string;
  /** Caps output tokens (Anthropic requires max_tokens). */
  maxTokens?: number;
  fetchImpl?: ChatFetch;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const DEFAULT_MAX_TOKENS = 8192;

/** URL the request is POSTed to, derived from provider base + api style. */
export function endpointUrl(model: ChatModel): string {
  const provider = getProvider(model.provider);
  if (!provider) throw new ProviderError(`Unknown provider: ${model.provider}`, 500);
  const path = model.apiStyle === "anthropic" ? "/messages" : "/chat/completions";
  return `${provider.baseUrl}${path}`;
}

/**
 * Build the request body for a model's API style.
 * Exported for tests; callers normally use callProvider().
 */
export function buildRequestBody(model: ChatModel, messages: ProviderMessage[], maxTokens: number): unknown {
  if (model.apiStyle === "anthropic") {
    return buildAnthropicBody(model, messages, maxTokens);
  }
  return buildOpenAiBody(model, messages, maxTokens);
}

function buildOpenAiBody(model: ChatModel, messages: ProviderMessage[], _maxTokens: number) {
  return {
    model: model.modelId,
    messages: messages.map((m) => ({
      role: m.role,
      content: toOpenAiContent(m),
    })),
  };
}

function toOpenAiContent(m: ProviderMessage): string | unknown[] {
  if (!m.images || m.images.length === 0) return m.content;
  const parts: unknown[] = [];
  // Text first so the model reads the question before the image.
  if (m.content) parts.push({ type: "text", text: m.content });
  for (const url of m.images) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  return parts;
}

function buildAnthropicBody(model: ChatModel, messages: ProviderMessage[], maxTokens: number) {
  // Anthropic separates system messages into a top-level `system` field.
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const conversation = messages.filter((m) => m.role !== "system");
  return {
    model: model.modelId,
    max_tokens: maxTokens,
    system: system || undefined,
    messages: conversation.map((m) => ({
      role: m.role,
      content: toAnthropicContent(m),
    })),
  };
}

function toAnthropicContent(m: ProviderMessage): string | unknown[] {
  if (!m.images || m.images.length === 0) return m.content;
  const parts: unknown[] = [];
  if (m.content) parts.push({ type: "text", text: m.content });
  for (const url of m.images) {
    // data:image/png;base64,AAAA → {type, media_type, data}
    const parsed = parseDataUrl(url);
    if (parsed) {
      parts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: parsed.mediaType,
          data: parsed.data,
        },
      });
    }
  }
  return parts;
}

function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const match = /^data:([^;]+);base64,(.*)$/.exec(url);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

/** Build the headers for a model's API style + key. */
export function buildHeaders(model: ChatModel, apiKey: string): Record<string, string> {
  if (model.apiStyle === "anthropic") {
    return {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

/**
 * Send the messages to the model and return the assistant's text reply.
 * Throws ProviderError on non-2xx or parse failure.
 */
export async function callProvider(opts: CallProviderOptions): Promise<string> {
  const { model, messages } = opts;
  const apiKey = opts.apiKey ?? resolveApiKey(model);
  if (!apiKey) {
    throw new ProviderError(
      `No API key configured for ${getProvider(model.provider)?.label ?? model.provider} (set ${getProvider(model.provider)?.apiKeyEnv ?? ""})`,
      401,
    );
  }
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = endpointUrl(model);
  const body = buildRequestBody(model, messages, maxTokens);
  const headers = buildHeaders(model, apiKey);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ProviderError(
      `Failed to reach ${getProvider(model.provider)?.label ?? model.provider}: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.error?.message ?? parsed?.message ?? text;
    } catch {
      /* keep raw text */
    }
    throw new ProviderError(
      `${getProvider(model.provider)?.label ?? model.provider} error (${res.status}): ${detail || res.statusText}`.slice(0, 1000),
      res.status,
    );
  }

  const data = await res.json().catch(() => null);
  if (!data) throw new ProviderError("Empty response from provider", 502);

  if (model.apiStyle === "anthropic") {
    // content is an array of blocks; join text blocks.
    const blocks = Array.isArray(data?.content) ? data.content : [];
    const text = blocks
      .map((b: { type?: string; text?: string }) => (b?.type === "text" ? b.text ?? "" : ""))
      .join("");
    return text || "";
  }
  // OpenAI-compatible
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  return choice?.message?.content ?? "";
}

/**
 * Map a ProviderError into a JSON NextResponse. Unknown errors become 500.
 * Used by the route handler so failures surface as text the user can read.
 */
export function providerErrorToResponse(err: unknown): NextResponse {
  if (err instanceof ProviderError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("Chat provider failure:", err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Unknown chat error" },
    { status: 500 },
  );
}