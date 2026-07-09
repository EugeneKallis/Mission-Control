/**
 * Unit tests for src/lib/chat/keys.ts — server-side API key resolution
 * with pi auth file fallback.
 *
 * These tests run on the actual server, so they can read the real pi auth
 * file. We test env-var priority and the fallback separately.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { resolveApiKey, isProviderConfigured, resetPiAuth } from "./keys";
import { getModelOrThrow } from "./models";

const flash = getModelOrThrow("opencode-go/deepseek-v4-flash");
const gpt4o = getModelOrThrow("openai/gpt-4o");

beforeEach(() => {
  resetPiAuth();
});

describe("keys with pi auth fallback", () => {
  test("env var takes priority over pi auth", () => {
    const prev = process.env.OPENCODE_GO_API_KEY;
    process.env.OPENCODE_GO_API_KEY = "sk-env-override";
    try {
      const key = resolveApiKey(flash);
      expect(key).toBe("sk-env-override");
    } finally {
      if (prev === undefined) delete process.env.OPENCODE_GO_API_KEY;
      else process.env.OPENCODE_GO_API_KEY = prev;
    }
  });

  test("falls back to pi auth when env var is missing", () => {
    const prev = process.env.OPENCODE_GO_API_KEY;
    delete process.env.OPENCODE_GO_API_KEY;
    try {
      const key = resolveApiKey(flash);
      // The real pi auth file has opencode-go key on this server.
      expect(key.length).toBeGreaterThan(0);
      expect(key).toContain("sk-");
      expect(isProviderConfigured(flash)).toBe(true);
    } finally {
      if (prev !== undefined) process.env.OPENCODE_GO_API_KEY = prev;
    }
  });

  test("returns empty for providers not in env or pi auth", () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(resolveApiKey(gpt4o)).toBe("");
      expect(isProviderConfigured(gpt4o)).toBe(false);
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });
});