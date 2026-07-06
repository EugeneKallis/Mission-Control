/**
 * Unit tests for POST /api/chat
 *
 * Covers:
 *  - Returns 200 with correct JSON shape
 *  - Returns assistant mock response
 *  - Returns 400 when body is missing messages array
 *  - Response includes id and timestamp fields
 */

import { describe, test, expect } from "bun:test";
import { jsonRequest, jsonBody, status } from "@/test-utils/route-helpers";

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("POST /api/chat", () => {
  test("returns 200 for valid request", async () => {
    const { POST } = await loadRoute();
    const req = jsonRequest("/api/chat", {
      messages: [
        { id: "1", role: "user", content: "Hello", timestamp: Date.now() },
      ],
    });
    const res = await POST(req);
    expect(status(res)).toBe(200);
  });

  test("returns mock assistant response", async () => {
    const { POST } = await loadRoute();
    const req = jsonRequest("/api/chat", {
      messages: [
        { id: "1", role: "user", content: "Hello", timestamp: Date.now() },
      ],
    });
    const res = await POST(req);
    const body = (await jsonBody(res)) as {
      role: string;
      content: string;
      id: string;
      timestamp: number;
    };
    expect(body.role).toBe("assistant");
    expect(body.content).toContain("Mock response");
  });

  test("returns 400 for missing messages field", async () => {
    const { POST } = await loadRoute();
    const req = jsonRequest("/api/chat", { notMessages: true });
    const res = await POST(req);
    expect(status(res)).toBe(400);
  });

  test("returns 400 for non-array messages", async () => {
    const { POST } = await loadRoute();
    const req = jsonRequest("/api/chat", { messages: "not-an-array" });
    const res = await POST(req);
    expect(status(res)).toBe(400);
  });

  test("response includes id and timestamp fields", async () => {
    const { POST } = await loadRoute();
    const req = jsonRequest("/api/chat", {
      messages: [
        { id: "1", role: "user", content: "Hi", timestamp: Date.now() },
      ],
    });
    const res = await POST(req);
    const body = (await jsonBody(res)) as {
      id: string;
      timestamp: number;
    };
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
    expect(typeof body.timestamp).toBe("number");
    expect(body.timestamp).toBeGreaterThan(0);
  });
});
