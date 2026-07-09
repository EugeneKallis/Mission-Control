/**
 * Tests for GET /api/chat/models — catalog listing (no DB needed).
 */
import { describe, test, expect } from "bun:test";
import { getRequest, jsonBody, status } from "@/test-utils/route-helpers";

const { GET } = await import("./route");

describe("GET /api/chat/models", () => {
  test("returns models sorted by price with default", async () => {
    const res = await GET();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { defaultModelId: string; models: { id: string; inputPricePerM: number; price: string; configured: boolean; chips: { key: string }[] }[] };
    expect(body.defaultModelId).toBe("opencode-go/deepseek-v4-flash");
    expect(body.models.length).toBeGreaterThan(0);
    // ascending by input price
    for (let i = 1; i < body.models.length; i++) {
      expect(body.models[i - 1].inputPricePerM).toBeLessThanOrEqual(body.models[i].inputPricePerM);
    }
    // a price label and capability chips are present
    expect(body.models[0].price).toContain("/M");
    expect(body.models[0].chips.length).toBeGreaterThan(0);
  });

  test("includes a vision-capable model", async () => {
    const res = await GET();
    const body = (await jsonBody(res)) as { models: { chips: { key: string }[] }[] };
    expect(body.models.some((m) => m.chips.some((c) => c.key === "vision"))).toBe(true);
  });
});