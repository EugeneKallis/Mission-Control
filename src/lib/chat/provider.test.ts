/**
 * Unit tests for the provider call layer (src/lib/chat/provider.ts).
 * Fetch is stubbed so no network is touched.
 */
import { describe, test, expect, mock } from "bun:test";
import {
  buildRequestBody,
  buildHeaders,
  endpointUrl,
  callProvider,
  ProviderError,
  type ProviderMessage,
} from "./provider";
import { getModelOrThrow } from "./models";

const flash = getModelOrThrow("opencode-go/deepseek-v4-flash"); // openai style
const qwen = getModelOrThrow("opencode-go/qwen3.7-plus"); // anthropic style
const gpt = getModelOrThrow("openai/gpt-4o");
const claude = getModelOrThrow("anthropic/claude-sonnet-4-5");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("endpointUrl", () => {
  test("openai style → /chat/completions", () => {
    expect(endpointUrl(flash)).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(endpointUrl(gpt)).toBe("https://api.openai.com/v1/chat/completions");
  });
  test("anthropic style → /messages", () => {
    expect(endpointUrl(qwen)).toBe("https://opencode.ai/zen/go/v1/messages");
    expect(endpointUrl(claude)).toBe("https://api.anthropic.com/v1/messages");
  });
});

describe("buildHeaders", () => {
  test("openai style uses Bearer", () => {
    const h = buildHeaders(flash, "sk-1");
    expect(h.authorization).toBe("Bearer sk-1");
    expect(h["content-type"]).toBe("application/json");
  });
  test("anthropic style uses x-api-key + anthropic-version", () => {
    const h = buildHeaders(claude, "sk-ant");
    expect(h["x-api-key"]).toBe("sk-ant");
    expect(h["anthropic-version"]).toBe("2023-06-01");
  });
});

describe("buildRequestBody (openai)", () => {
  test("plain text message", () => {
    const body = buildRequestBody(flash, [{ role: "user", content: "hi" }], 1024) as {
      model: string; messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toBe("hi");
  });

  test("vision message produces image_url parts", () => {
    const body = buildRequestBody(gpt, [
      { role: "user", content: "what is this?", images: ["data:image/png;base64,AAAA"] },
    ], 1024) as { messages: { content: unknown }[] };
    const content = body.messages[0].content as unknown[];
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: "text", text: "what is this?" });
    expect(content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } });
  });
});

describe("buildRequestBody (anthropic)", () => {
  test("system messages move to top-level system field", () => {
    const body = buildRequestBody(claude, [
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
    ], 1024) as { system?: string; messages: { role: string; content: string }[] };
    expect(body.system).toBe("be brief");
    expect(body.messages[0].role).toBe("user");
  });

  test("max_tokens is required and present", () => {
    const body = buildRequestBody(qwen, [{ role: "user", content: "hi" }], 4096) as { max_tokens: number };
    expect(body.max_tokens).toBe(4096);
  });

  test("vision message produces base64 image block", () => {
    const body = buildRequestBody(claude, [
      { role: "user", content: "describe", images: ["data:image/png;base64,AAAA"] },
    ], 1024) as { messages: { content: unknown }[] };
    const content = body.messages[0].content as unknown[];
    expect(content[0]).toEqual({ type: "text", text: "describe" });
    expect(content[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAAA" },
    });
  });
});

describe("callProvider", () => {
  const messages: ProviderMessage[] = [{ role: "user", content: "hi" }];

  test("returns assistant text from an openai-compatible response", async () => {
    const fetchImpl = mock(async () =>
      jsonResponse({ choices: [{ message: { content: "hello!" } }] }),
    );
    const out = await callProvider({ model: flash, messages, apiKey: "sk", fetchImpl });
    expect(out).toBe("hello!");
  });

  test("returns assistant text from an anthropic response", async () => {
    const fetchImpl = mock(async () =>
      jsonResponse({ content: [{ type: "text", text: "anthropic reply" }] }),
    );
    const out = await callProvider({ model: qwen, messages, apiKey: "sk", fetchImpl });
    expect(out).toBe("anthropic reply");
  });

  test("throws ProviderError 401 when no api key", async () => {
    const fetchImpl = mock(async () => jsonResponse({}));
    await expect(
      callProvider({ model: flash, messages, apiKey: "", fetchImpl }),
    ).rejects.toMatchObject({ name: "ProviderError", status: 401 });
  });

  test("throws ProviderError on non-2xx with provider message", async () => {
    const fetchImpl = mock(async () =>
      jsonResponse({ error: { message: "rate limited" } }, 429),
    );
    await expect(
      callProvider({ model: flash, messages, apiKey: "sk", fetchImpl }),
    ).rejects.toMatchObject({ name: "ProviderError", status: 429 });
  });

  test("throws ProviderError on network failure", async () => {
    const fetchImpl = mock(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      callProvider({ model: flash, messages, apiKey: "sk", fetchImpl }),
    ).rejects.toMatchObject({ name: "ProviderError", status: 502 });
  });
});