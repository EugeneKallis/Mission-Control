/**
 * Unit tests for /api/pi/sessions route — list and manage Pi sessions.
 */
import { describe, test, expect, afterEach, mock } from "bun:test";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

describe("GET /api/pi/sessions", () => {
  test("returns array of sessions", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { sessions?: unknown[] };
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  test("sessions are sorted newest-first", async () => {
    const res = await GET();
    const body = await res.json() as { sessions?: Array<{ lastModified: string }> };
    const dates = (body.sessions ?? []).map((s) => new Date(s.lastModified).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  test("each session has required fields", async () => {
    const res = await GET();
    const body = await res.json() as { sessions?: Array<Record<string, unknown>> };
    for (const session of body.sessions ?? []) {
      expect(session).toHaveProperty("id");
      expect(session).toHaveProperty("name");
      expect(session).toHaveProperty("lastModified");
      expect(session).toHaveProperty("messageCount");
      expect(typeof session.id).toBe("string");
      expect(typeof session.name).toBe("string");
      expect(typeof session.messageCount).toBe("number");
    }
  });
});

describe("POST /api/pi/sessions", () => {
  test("returns 400 when id is missing", async () => {
    const req = new NextRequest("http://localhost/api/pi/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("returns 400 when name is missing", async () => {
    const req = new NextRequest("http://localhost/api/pi/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "test-id" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("returns 400 for path traversal", async () => {
    const req = new NextRequest("http://localhost/api/pi/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "../../etc/passwd", name: "hack" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("returns 404 for non-existent session", async () => {
    const req = new NextRequest("http://localhost/api/pi/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "nonexistent-session-id-12345", name: "Test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});
