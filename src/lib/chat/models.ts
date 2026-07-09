/**
 * Chat model catalog — providers + models with pricing, capabilities and
 * OpenAI/Anthropic-compatible endpoint metadata.
 *
 * The default model is "opencode-go/deepseek-v4-flash" (OpenCode Go's
 * DeepSeek V4 Flash), an OpenAI-compatible endpoint at
 * https://opencode.ai/zen/go/v1.
 *
 * Prices are USD per 1M tokens (input / output) as published by each
 * provider. OpenCode Go prices were verified against
 * https://models.dev/providers/opencode-go and https://opencode.ai/docs/go
 * on 2026-07-08. Other-provider prices are approximate and may drift — the
 * catalog is a plain data array, edit it freely.
 *
 * All helpers here are pure (no I/O, no DB) so they unit-test trivially.
 */

export type Capability = "text" | "vision" | "tools" | "reasoning";

/** How the provider accepts chat requests. */
export type ApiStyle = "openai" | "anthropic";

export interface ChatProvider {
  id: string;
  label: string;
  /** Base URL (no trailing slash). Path is appended per ApiStyle. */
  baseUrl: string;
  /** Env var holding this provider's API key. */
  apiKeyEnv: string;
}

export interface ChatModel {
  /** Composite id "<provider>/<modelId>" — the stable catalog key. */
  id: string;
  /** Raw model id sent to the provider API. */
  modelId: string;
  provider: string;
  name: string;
  /** USD per 1M input tokens. */
  inputPricePerM: number;
  /** USD per 1M output tokens. */
  outputPricePerM: number;
  /** Context window in tokens. */
  contextWindow: number;
  /** Max output tokens the model can produce. */
  maxOutput: number;
  capabilities: Capability[];
  /** API surface this model is served through. */
  apiStyle: ApiStyle;
}

// ── Providers ──────────────────────────────────────────────────────────────

export const PROVIDERS: ChatProvider[] = [
  {
    id: "opencode-go",
    label: "OpenCode Go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    apiKeyEnv: "OPENCODE_GO_API_KEY",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
  {
    id: "google",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyEnv: "GEMINI_API_KEY",
  },
];

export function getProvider(id: string): ChatProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

// ── Default ────────────────────────────────────────────────────────────────

/** Composite id of the model selected for brand-new sessions. */
export const DEFAULT_MODEL_ID = "opencode-go/deepseek-v4-flash";

// ── Model catalog ──────────────────────────────────────────────────────────
//
// OpenCode Go models are text-only coding models (no vision/audio). All
// support tool calls + reasoning. The two API surfaces are split:
//   - openai    → POST {baseUrl}/chat/completions
//   - anthropic → POST {baseUrl}/messages
// (see https://opencode.ai/docs/go/#endpoints)

export const MODELS: ChatModel[] = [
  // ── OpenCode Go (text-only, tools, reasoning) ──────────────────────────
  {
    id: "opencode-go/deepseek-v4-flash", modelId: "deepseek-v4-flash",
    provider: "opencode-go", name: "DeepSeek V4 Flash",
    inputPricePerM: 0.14, outputPricePerM: 0.28, contextWindow: 1_000_000, maxOutput: 384_000,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "openai",
  },
  {
    id: "opencode-go/mimo-v2.5", modelId: "mimo-v2.5",
    provider: "opencode-go", name: "MiMo V2.5",
    inputPricePerM: 0.14, outputPricePerM: 0.28, contextWindow: 1_000_000, maxOutput: 128_000,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "openai",
  },
  {
    id: "opencode-go/minimax-m3", modelId: "minimax-m3",
    provider: "opencode-go", name: "MiniMax M3",
    inputPricePerM: 0.30, outputPricePerM: 1.20, contextWindow: 1_000_000, maxOutput: 131_072,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "anthropic",
  },
  {
    id: "opencode-go/minimax-m2.7", modelId: "minimax-m2.7",
    provider: "opencode-go", name: "MiniMax M2.7",
    inputPricePerM: 0.30, outputPricePerM: 1.20, contextWindow: 204_800, maxOutput: 131_072,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "anthropic",
  },
  {
    id: "opencode-go/qwen3.7-plus", modelId: "qwen3.7-plus",
    provider: "opencode-go", name: "Qwen3.7 Plus",
    inputPricePerM: 0.40, outputPricePerM: 1.60, contextWindow: 1_000_000, maxOutput: 65_536,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "anthropic",
  },
  {
    id: "opencode-go/qwen3.6-plus", modelId: "qwen3.6-plus",
    provider: "opencode-go", name: "Qwen3.6 Plus",
    inputPricePerM: 0.50, outputPricePerM: 3.00, contextWindow: 1_000_000, maxOutput: 65_536,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "anthropic",
  },
  {
    id: "opencode-go/glm-5.2", modelId: "glm-5.2",
    provider: "opencode-go", name: "GLM-5.2",
    inputPricePerM: 1.40, outputPricePerM: 4.40, contextWindow: 1_000_000, maxOutput: 131_072,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "openai",
  },
  {
    id: "opencode-go/glm-5.1", modelId: "glm-5.1",
    provider: "opencode-go", name: "GLM-5.1",
    inputPricePerM: 1.40, outputPricePerM: 4.40, contextWindow: 202_752, maxOutput: 32_768,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "openai",
  },
  {
    id: "opencode-go/deepseek-v4-pro", modelId: "deepseek-v4-pro",
    provider: "opencode-go", name: "DeepSeek V4 Pro",
    inputPricePerM: 1.74, outputPricePerM: 3.48, contextWindow: 1_000_000, maxOutput: 384_000,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "openai",
  },
  {
    id: "opencode-go/mimo-v2.5-pro", modelId: "mimo-v2.5-pro",
    provider: "opencode-go", name: "MiMo V2.5 Pro",
    inputPricePerM: 1.74, outputPricePerM: 3.48, contextWindow: 1_048_576, maxOutput: 128_000,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "openai",
  },
  {
    id: "opencode-go/kimi-k2.6", modelId: "kimi-k2.6",
    provider: "opencode-go", name: "Kimi K2.6",
    inputPricePerM: 0.95, outputPricePerM: 4.00, contextWindow: 262_144, maxOutput: 65_536,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "openai",
  },
  {
    id: "opencode-go/kimi-k2.7-code", modelId: "kimi-k2.7-code",
    provider: "opencode-go", name: "Kimi K2.7 Code",
    inputPricePerM: 0.95, outputPricePerM: 4.00, contextWindow: 262_144, maxOutput: 262_144,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "openai",
  },
  {
    id: "opencode-go/qwen3.7-max", modelId: "qwen3.7-max",
    provider: "opencode-go", name: "Qwen3.7 Max",
    inputPricePerM: 2.50, outputPricePerM: 7.50, contextWindow: 1_000_000, maxOutput: 65_536,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "anthropic",
  },

  // ── OpenAI (vision-capable frontier models) ─────────────────────────────
  {
    id: "openai/gpt-4o-mini", modelId: "gpt-4o-mini",
    provider: "openai", name: "GPT-4o mini",
    inputPricePerM: 0.15, outputPricePerM: 0.60, contextWindow: 128_000, maxOutput: 16_384,
    capabilities: ["text", "vision", "tools"], apiStyle: "openai",
  },
  {
    id: "openai/gpt-4o", modelId: "gpt-4o",
    provider: "openai", name: "GPT-4o",
    inputPricePerM: 2.50, outputPricePerM: 10.00, contextWindow: 128_000, maxOutput: 16_384,
    capabilities: ["text", "vision", "tools"], apiStyle: "openai",
  },
  {
    id: "openai/o4-mini", modelId: "o4-mini",
    provider: "openai", name: "o4-mini",
    inputPricePerM: 1.10, outputPricePerM: 4.40, contextWindow: 200_000, maxOutput: 100_000,
    capabilities: ["text", "tools", "reasoning"], apiStyle: "openai",
  },

  // ── Google Gemini (vision + large context, OpenAI-compatible mode) ──────
  {
    id: "google/gemini-2.5-flash", modelId: "gemini-2.5-flash",
    provider: "google", name: "Gemini 2.5 Flash",
    inputPricePerM: 0.30, outputPricePerM: 2.50, contextWindow: 1_000_000, maxOutput: 65_536,
    capabilities: ["text", "vision", "tools", "reasoning"], apiStyle: "openai",
  },
  {
    id: "google/gemini-2.5-pro", modelId: "gemini-2.5-pro",
    provider: "google", name: "Gemini 2.5 Pro",
    inputPricePerM: 1.25, outputPricePerM: 10.00, contextWindow: 2_000_000, maxOutput: 65_536,
    capabilities: ["text", "vision", "tools", "reasoning"], apiStyle: "openai",
  },

  // ── Anthropic Claude (vision-capable frontier models) ──────────────────
  {
    id: "anthropic/claude-haiku-4-5", modelId: "claude-haiku-4-5",
    provider: "anthropic", name: "Claude Haiku 4.5",
    inputPricePerM: 1.00, outputPricePerM: 5.00, contextWindow: 200_000, maxOutput: 8192,
    capabilities: ["text", "vision", "tools"], apiStyle: "anthropic",
  },
  {
    id: "anthropic/claude-sonnet-4-5", modelId: "claude-sonnet-4-5",
    provider: "anthropic", name: "Claude Sonnet 4.5",
    inputPricePerM: 3.00, outputPricePerM: 15.00, contextWindow: 200_000, maxOutput: 8192,
    capabilities: ["text", "vision", "tools", "reasoning"], apiStyle: "anthropic",
  },
];

// ── Accessors ──────────────────────────────────────────────────────────────

export function listModels(): ChatModel[] {
  return MODELS;
}

export function getModel(id: string): ChatModel | undefined {
  return MODELS.find((m) => m.id === id);
}

export function getModelOrThrow(id: string): ChatModel {
  const m = getModel(id);
  if (!m) throw new Error(`Unknown chat model: ${id}`);
  return m;
}

export function defaultModel(): ChatModel {
  return getModelOrThrow(DEFAULT_MODEL_ID);
}

/**
 * Models sorted by price — cheapest first (input price, then output price
 * as tie-breaker). Used by the model selector so the catalog reads from
 * most-affordable to most-expensive.
 */
export function modelsSortedByPrice(models: ChatModel[] = MODELS): ChatModel[] {
  return [...models].sort((a, b) =>
    a.inputPricePerM - b.inputPricePerM ||
    a.outputPricePerM - b.outputPricePerM,
  );
}

export function modelsByProvider(provider: string): ChatModel[] {
  return MODELS.filter((m) => m.provider === provider);
}

export function hasCapability(model: ChatModel, cap: Capability): boolean {
  return model.capabilities.includes(cap);
}

/** Whether a model can accept image attachments. */
export function supportsVision(model: ChatModel): boolean {
  return hasCapability(model, "vision");
}

// ── Capability display ─────────────────────────────────────────────────────

export interface CapabilityMeta {
  key: Exclude<Capability, "text">;
  label: string;
  icon: string;
}

/** Shown as capability chips in the selector (text is assumed for all). */
export const CAPABILITY_META: CapabilityMeta[] = [
  { key: "vision", label: "Vision", icon: "image" },
  { key: "tools", label: "Tools", icon: "build" },
  { key: "reasoning", label: "Reasoning", icon: "psychology" },
];

/** Human-readable chip list for a model (text always implied). */
export function capabilityChips(model: ChatModel): CapabilityMeta[] {
  return CAPABILITY_META.filter((c) => hasCapability(model, c.key));
}

// ── Attachment media handling ───────────────────────────────────────────────

export type AttachmentCategory = "text" | "image" | "unsupported";

export interface AttachmentInput {
  name: string;
  mimeType: string;
}

/** MIME types we treat as inline-able text (any text model can read them). */
const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/javascript", "application/xml"];
const TEXT_EXTENSIONS = [
  ".txt", ".md", ".markdown", ".rst", ".json", ".jsonc", ".js", ".jsx",
  ".mjs", ".cjs", ".ts", ".tsx", ".go", ".py", ".rb", ".rs", ".java",
  ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".php", ".pl", ".sh", ".bash",
  ".zsh", ".fish", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf",
  ".env", ".sql", ".html", ".htm", ".css", ".scss", ".svg", ".vue",
  ".graphql", ".gql", ".proto", ".kt", ".swift", ".scala", ".clj",
  ".lua", ".r", ".dart", ".ex", ".exs", ".heex", ".zig", ".nim",
];

export function isTextLike(name: string, mimeType: string): boolean {
  if (TEXT_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) return true;
  const lower = name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function categorizeAttachment(att: AttachmentInput): AttachmentCategory {
  if (att.mimeType.startsWith("image/")) return "image";
  if (isTextLike(att.name, att.mimeType)) return "text";
  return "unsupported";
}

/**
 * Whether a given model can ingest an attachment of a category.
 *
 *   text        → always (inlined into the prompt)
 *   image       → only vision-capable models
 *   unsupported → never (audio/video/pdf/binary aren't wired up)
 */
export function attachmentSupported(
  model: ChatModel,
  category: AttachmentCategory,
): boolean {
  if (category === "text") return true;
  if (category === "image") return supportsVision(model);
  return false;
}

/**
 * Validate a batch of attachments against a model. Returns the first
 * unsupported attachment (for the warning UI) plus the resolved categories.
 */
export interface AttachmentCheck {
  att: AttachmentInput;
  category: AttachmentCategory;
  supported: boolean;
  reason?: string;
}

export function checkAttachments(
  model: ChatModel,
  attachments: AttachmentInput[],
): AttachmentCheck[] {
  return attachments.map((att) => {
    const category = categorizeAttachment(att);
    const supported = attachmentSupported(model, category);
    const reason = supported
      ? undefined
      : category === "image"
        ? `${model.name} can't read images (no vision support)`
        : category === "unsupported"
          ? `${model.name} can't read ${att.mimeType || att.name} files`
          : undefined;
    return { att, category, supported, reason };
  });
}

/** Format a price as "$X.XX" per 1M tokens. */
export function formatPrice(perM: number): string {
  if (perM === 0) return "Free";
  if (perM < 1) return `$${perM.toFixed(2)}`;
  return `$${perM.toFixed(2)}`;
}

/** "$0.14 · $0.28 /M" style summary for a model. */
export function priceSummary(model: ChatModel): string {
  return `${formatPrice(model.inputPricePerM)} in · ${formatPrice(model.outputPricePerM)} out /M`;
}

// ── Pi auth file fallback ──────────────────────────────────────────────────

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const PI_AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");

let _piAuth: Record<string, { type: string; key: string }> | null | undefined;

/**
 * Read pi's provider auth file (~/.pi/agent/auth.json) once and cache it.
 * Returns a map of providerId → {key} or null if missing/invalid.
 */
function readPiAuth(): Record<string, { key: string }> | null {
  if (_piAuth !== undefined) return _piAuth as Record<string, { key: string }> | null;
  try {
    if (!existsSync(PI_AUTH_PATH)) {
      _piAuth = null;
      return null;
    }
    const raw = readFileSync(PI_AUTH_PATH, "utf8");
    _piAuth = JSON.parse(raw) as Record<string, { type: string; key: string }>;
    return _piAuth!;
  } catch {
    _piAuth = null;
    return null;
  }
}

// ── API key resolution ─────────────────────────────────────────────────────

/**
 * Resolve the API key for a model's provider.
 *
 * Priority:
 *  1. The provider's env var (e.g. OPENCODE_GO_API_KEY)
 *  2. Pi's auth file (~/.pi/agent/auth.json) under the provider id
 *
 * Returns empty string if neither source has a key.
 */
export function resolveApiKey(model: ChatModel): string {
  const provider = getProvider(model.provider);
  if (!provider) return "";

  // 1. Env var
  const envKey = process.env[provider.apiKeyEnv];
  if (envKey && envKey.length > 0) return envKey;

  // 2. Pi auth file fallback
  const piAuth = readPiAuth();
  if (piAuth && piAuth[model.provider]?.key) {
    return piAuth[model.provider].key;
  }

  return "";
}

/** Whether the provider of a model has an API key configured. */
export function isProviderConfigured(model: ChatModel): boolean {
  return resolveApiKey(model).length > 0;
}