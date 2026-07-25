/**
 * Tests for GET + POST /api/pve/endpoints
 */

import { test, expect, mock, afterEach } from "bun:test";

// ── Mock DB ─────────────────────────────────────────────────────────────────

mock.module("@/lib/db", () => ({
  default: {},
  db: {},
}));

const mockListEndpoints = mock<() => any[]>();
const mockCreateEndpoint = mock<(data: any) => any>();
const mockGetEndpoint = mock<(id: number) => any>();
const mockUpdateEndpoint = mock<(id: number, data: any) => any>();
const mockDeleteEndpoint = mock<(id: number) => any>();

mock.module("@/lib/db/queries", () => ({
  listProxmoxEndpoints: mockListEndpoints,
  createProxmoxEndpoint: mockCreateEndpoint,
  getProxmoxEndpoint: mockGetEndpoint,
  updateProxmoxEndpoint: mockUpdateEndpoint,
  deleteProxmoxEndpoint: mockDeleteEndpoint,
}));

import { GET, POST } from "./route";
import { GET as GetSingle, PUT, DELETE } from "./[id]/route";

/** Route params are a Promise in Next 15+ */
function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

afterEach(() => {
  mockListEndpoints.mockClear();
  mockCreateEndpoint.mockClear();
  mockGetEndpoint.mockClear();
  mockUpdateEndpoint.mockClear();
  mockDeleteEndpoint.mockClear();
});

// ── GET /api/pve/endpoints ──────────────────────────────────────────────────

test("GET returns masked endpoints list", async () => {
  mockListEndpoints.mockReturnValue([
    { id: 1, name: "Main", apiUrl: "https://pve1:8006", apiToken: "root@pam!tok=abc123", verifyTls: false, enabled: true, order: 0 },
  ]);

  const res = await GET();
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json).toHaveLength(1);
  expect(json[0].apiToken).not.toBe("root@pam!tok=abc123");
  expect(json[0].apiToken).toMatch(/c123$/); // masked, last 4 visible
  expect(json[0].name).toBe("Main");
});

// ── POST /api/pve/endpoints ─────────────────────────────────────────────────

test("POST creates endpoint", async () => {
  mockCreateEndpoint.mockResolvedValue({ id: 1, name: "New", apiUrl: "https://pve2:8006", apiToken: "tok456" });

  const req = new Request("http://localhost/api/pve/endpoints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "New", apiUrl: "https://pve2:8006", apiToken: "tok456", verifyTls: true, enabled: true }),
  });
  const res = await POST(req);
  expect(res.status).toBe(201);
  const json = await res.json();
  expect(json.name).toBe("New");
});

test("POST validates required fields", async () => {
  const req = new Request("http://localhost/api/pve/endpoints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", apiUrl: "", apiToken: "" }),
  });
  const res = await POST(req);
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error).toBeDefined();
});

// ── GET /api/pve/endpoints/:id ──────────────────────────────────────────────

test("GET single endpoint returns masked token", async () => {
  mockGetEndpoint.mockResolvedValue({ id: 1, name: "Main", apiUrl: "https://pve1:8006", apiToken: "secret-long-token", verifyTls: true, enabled: true, order: 0 });

  const res = await GetSingle(new Request("http://localhost"), paramsOf("1"));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.apiToken).not.toBe("secret-long-token");
  expect(json.apiToken).toMatch(/oken$/);
});

test("GET single returns 404 for missing endpoint", async () => {
  mockGetEndpoint.mockResolvedValue(null);
  const res = await GetSingle(new Request("http://localhost"), paramsOf("999"));
  expect(res.status).toBe(404);
});

// ── PUT /api/pve/endpoints/:id ──────────────────────────────────────────────

test("PUT updates endpoint", async () => {
  mockGetEndpoint.mockResolvedValue({ id: 1, name: "Main", apiUrl: "https://pve1:8006", apiToken: "old-token", verifyTls: false, enabled: true, order: 0 });
  mockUpdateEndpoint.mockResolvedValue({ id: 1, name: "Updated", apiUrl: "https://pve1:8006", apiToken: "old-token", verifyTls: true, enabled: true, order: 0 });

  const req = new Request("http://localhost", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Updated", verifyTls: true }),
  });
  const res = await PUT(req, paramsOf("1"));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.name).toBe("Updated");
  // Should keep existing token when not provided
  expect(mockUpdateEndpoint.mock.calls[0][1].apiToken).toBeUndefined();
});

test("PUT replaces token when provided", async () => {
  mockGetEndpoint.mockResolvedValue({ id: 1, name: "Main", apiUrl: "https://pve1:8006", apiToken: "old-token", verifyTls: true, enabled: true, order: 0 });
  mockUpdateEndpoint.mockResolvedValue({ id: 1 });

  const req = new Request("http://localhost", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiToken: "new-token" }),
  });
  const res = await PUT(req, paramsOf("1"));
  expect(res.status).toBe(200);
  expect(mockUpdateEndpoint.mock.calls[0][1].apiToken).toBe("new-token");
});

test("PUT returns 404 for missing endpoint", async () => {
  mockGetEndpoint.mockResolvedValue(null);
  const req = new Request("http://localhost", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Nope" }),
  });
  const res = await PUT(req, paramsOf("999"));
  expect(res.status).toBe(404);
});

// ── DELETE /api/pve/endpoints/:id ───────────────────────────────────────────

test("DELETE removes endpoint", async () => {
  mockDeleteEndpoint.mockResolvedValue({ id: 1 });
  const res = await DELETE(new Request("http://localhost"), paramsOf("1"));
  expect(res.status).toBe(204);
});

test("DELETE validates id", async () => {
  const res = await DELETE(new Request("http://localhost"), paramsOf("abc"));
  expect(res.status).toBe(400);
});

test("PUT validates invalid id", async () => {
  const req = new Request("http://localhost", {
    method: "PUT",
    body: JSON.stringify({ name: "x" }),
  });
  const res = await PUT(req, paramsOf("xyz"));
  expect(res.status).toBe(400);
});

test("GET validates invalid id", async () => {
  const res = await GetSingle(new Request("http://localhost"), paramsOf("nan"));
  expect(res.status).toBe(400);
});
