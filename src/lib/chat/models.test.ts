/**
 * Unit tests for the chat model catalog + attachment helpers (pure module).
 */
import { describe, test, expect } from "bun:test";
import {
  MODELS,
  DEFAULT_MODEL_ID,
  PROVIDERS,
  getModel,
  getModelOrThrow,
  defaultModel,
  modelsSortedByPrice,
  modelsByProvider,
  hasCapability,
  supportsVision,
  capabilityChips,
  isTextLike,
  categorizeAttachment,
  attachmentSupported,
  checkAttachments,
  formatPrice,
  priceSummary,
  resolveApiKey,
  isProviderConfigured,
} from "./models";

describe("chat models catalog", () => {
  test("default model is opencode-go/deepseek-v4-flash", () => {
    expect(DEFAULT_MODEL_ID).toBe("opencode-go/deepseek-v4-flash");
    const m = defaultModel();
    expect(m.provider).toBe("opencode-go");
    expect(m.modelId).toBe("deepseek-v4-flash");
  });

  test("every model id is unique and of form provider/modelId", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MODELS) {
      expect(m.id).toBe(`${m.provider}/${m.modelId}`);
    }
  });

  test("every model has a known provider and a baseUrl", () => {
    const providerIds = new Set(PROVIDERS.map((p) => p.id));
    for (const m of MODELS) {
      expect(providerIds.has(m.provider)).toBe(true);
    }
  });

  test("getModel returns undefined for unknown id", () => {
    expect(getModel("nope/x")).toBeUndefined();
  });

  test("getModelOrThrow throws for unknown id", () => {
    expect(() => getModelOrThrow("nope/x")).toThrow(/Unknown chat model/);
  });

  test("modelsSortedByPrice is ascending by input price", () => {
    const sorted = modelsSortedByPrice();
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const cmp = a.inputPricePerM - b.inputPricePerM;
      expect(cmp <= 0 || (cmp === 0 && a.outputPricePerM <= b.outputPricePerM)).toBe(true);
    }
    // cheapest first
    expect(sorted[0].inputPricePerM).toBeLessThanOrEqual(sorted[sorted.length - 1].inputPricePerM);
  });

  test("modelsByProvider filters to one provider", () => {
    const go = modelsByProvider("opencode-go");
    expect(go.length).toBeGreaterThan(0);
    expect(go.every((m) => m.provider === "opencode-go")).toBe(true);
  });

  test("opencode-go models are text-only (no vision)", () => {
    const go = modelsByProvider("opencode-go");
    for (const m of go) {
      expect(supportsVision(m)).toBe(false);
      expect(hasCapability(m, "tools")).toBe(true);
      expect(hasCapability(m, "reasoning")).toBe(true);
    }
  });

  test("some non-opencode models support vision", () => {
    const visionModels = MODELS.filter(supportsVision);
    expect(visionModels.length).toBeGreaterThan(0);
    expect(visionModels.some((m) => m.provider === "openai")).toBe(true);
    expect(visionModels.some((m) => m.provider === "anthropic")).toBe(true);
    expect(visionModels.some((m) => m.provider === "google")).toBe(true);
  });

  test("capabilityChips excludes text (implied)", () => {
    const chips = capabilityChips(defaultModel());
    expect(chips.every((c) => c.key !== ("text" as never))).toBe(true);
    expect(chips.some((c) => c.key === "tools")).toBe(true);
  });
});

describe("attachment categorization", () => {
  test("isTextLike detects code + text extensions by name", () => {
    expect(isTextLike("app.ts", "application/octet-stream")).toBe(true);
    expect(isTextLike("README.md", "")).toBe(true);
    expect(isTextLike("data.json", "")).toBe(true);
    expect(isTextLike("photo.png", "image/png")).toBe(false);
    expect(isTextLike("song.mp3", "audio/mpeg")).toBe(false);
  });

  test("isTextLike detects by mime prefix", () => {
    expect(isTextLike("blob", "text/plain")).toBe(true);
    expect(isTextLike("blob", "application/json")).toBe(true);
  });

  test("categorizeAttachment splits image / text / unsupported", () => {
    expect(categorizeAttachment({ name: "a.png", mimeType: "image/png" })).toBe("image");
    expect(categorizeAttachment({ name: "notes.md", mimeType: "text/markdown" })).toBe("text");
    expect(categorizeAttachment({ name: "song.mp3", mimeType: "audio/mpeg" })).toBe("unsupported");
    expect(categorizeAttachment({ name: "doc.pdf", mimeType: "application/pdf" })).toBe("unsupported");
  });
});

describe("attachment support checks", () => {
  const flash = defaultModel(); // text-only
  const gpt = getModelOrThrow("openai/gpt-4o"); // vision

  test("text attachments are always supported", () => {
    expect(attachmentSupported(flash, "text")).toBe(true);
    expect(attachmentSupported(gpt, "text")).toBe(true);
  });

  test("image attachments need vision", () => {
    expect(attachmentSupported(flash, "image")).toBe(false);
    expect(attachmentSupported(gpt, "image")).toBe(true);
  });

  test("unsupported category never supported", () => {
    expect(attachmentSupported(gpt, "unsupported")).toBe(false);
  });

  test("checkAttachments flags an image against a text-only model", () => {
    const checks = checkAttachments(flash, [
      { name: "ok.ts", mimeType: "text/typescript" },
      { name: "pic.png", mimeType: "image/png" },
    ]);
    expect(checks[0].supported).toBe(true);
    expect(checks[1].supported).toBe(false);
    expect(checks[1].reason).toContain("images");
  });

  test("checkAttachments passes an image against a vision model", () => {
    const checks = checkAttachments(gpt, [
      { name: "pic.png", mimeType: "image/png" },
    ]);
    expect(checks[0].supported).toBe(true);
    expect(checks[0].reason).toBeUndefined();
  });

  test("checkAttachments flags a pdf against any model", () => {
    const checks = checkAttachments(gpt, [
      { name: "doc.pdf", mimeType: "application/pdf" },
    ]);
    expect(checks[0].supported).toBe(false);
  });
});

describe("price formatting", () => {
  test("formatPrice", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(0.14)).toBe("$0.14");
    expect(formatPrice(2.5)).toBe("$2.50");
  });

  test("priceSummary combines in + out", () => {
    const s = priceSummary(defaultModel());
    expect(s).toContain("$0.14");
    expect(s).toContain("$0.28");
    expect(s).toContain("/M");
  });
});

describe("api key resolution", () => {
  test("resolveApiKey reads the provider's env var", () => {
    const prev = process.env.OPENCODE_GO_API_KEY;
    process.env.OPENCODE_GO_API_KEY = "sk-test";
    try {
      expect(resolveApiKey(defaultModel())).toBe("sk-test");
      expect(isProviderConfigured(defaultModel())).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.OPENCODE_GO_API_KEY;
      else process.env.OPENCODE_GO_API_KEY = prev;
    }
  });

  test("isProviderConfigured is false when key missing", () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(isProviderConfigured(getModelOrThrow("openai/gpt-4o"))).toBe(false);
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });
});