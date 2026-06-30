/**
 * Unit tests for /api/hello (GET)
 *
 * Trivial route — no mocks needed. Just verify the shape.
 */

import { describe, test, expect } from "bun:test";
import { jsonBody, status } from "@/test-utils/route-helpers";

describe("GET /api/hello", () => {
  test("returns 200 with a message and a valid ISO timestamp", async () => {
    const { GET } = await import(`./route?bust=${Date.now()}-${Math.random()}`);
    const before = Date.now();
    const res = await GET();
    const after = Date.now();
    expect(status(res)).toBe(200);
    const body = (await jsonBody(res)) as { message: string; timestamp: string };
    expect(body.message).toBe("Hello from Mission Control!");
    const ts = Date.parse(body.timestamp);
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
