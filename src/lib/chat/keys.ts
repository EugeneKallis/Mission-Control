/**
 * Server-only API key resolution for chat providers.
 *
 * Checks the provider's env var first, then falls back to pi's auth file
 * (~/.pi/agent/auth.json). This module imports Node.js built-ins (fs, os)
 * so it MUST NOT be imported from client components — only from API routes
 * and server-side code (like provider.ts).
 *
 * The pure (client-safe) helpers live in ./models.ts — they only check
 * process.env.
 */

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getProvider, type ChatModel } from "./models";

const PI_AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");

let _piAuth: Record<string, { type: string; key: string }> | null | undefined;

/**
 * Read pi's provider auth file once and cache it in-memory.
 * Returns null if the file doesn't exist or can't be parsed.
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

/** Reset the cached pi auth (for tests). */
export function resetPiAuth(): void {
  _piAuth = undefined;
}