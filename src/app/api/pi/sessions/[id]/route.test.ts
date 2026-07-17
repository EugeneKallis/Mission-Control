/**
 * Unit tests for DELETE /api/pi/sessions/[id]
 */
import { describe, test, expect } from "bun:test";
import { DELETE } from "./route";

describe("DELETE /api/pi/sessions/[id]", () => {
  test("returns 400 when id is empty", async () => {
    const req = new Request("http://localhost/api/pi/sessions/");
    const res = await DELETE(req, { params: Promise.resolve({ id: "" }) });
    expect(res.status).toBe(400);
  });

  test("returns 400 for path traversal", async () => {
    const req = new Request("http://localhost/api/pi/sessions/../../etc");
    const res = await DELETE(req, { params: Promise.resolve({ id: "../../etc" }) });
    expect(res.status).toBe(400);
  });

  test("returns 404 for non-existent session", async () => {
    const req = new Request("http://localhost/api/pi/sessions/nonexistent");
    const res = await DELETE(req, { params: Promise.resolve({ id: "nonexistent-session-99999" }) });
    expect(res.status).toBe(404);
  });
});
