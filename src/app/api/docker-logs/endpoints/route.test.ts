import { afterEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("@/lib/db/queries", () => ({
  listDozzleEndpoints: mock(),
  createDozzleEndpoint: mock(),
  getDozzleEndpoint: mock(),
  updateDozzleEndpoint: mock(),
  deleteDozzleEndpoint: mock(),
}));

import {
  GET,
  POST,
} from "./route";
import {
  DELETE as DELETE_ONE,
  GET as GET_ONE,
  PUT,
} from "./[id]/route";
import { GET as GET_EVENTS } from "./[id]/events/stream/route";
import { GET as GET_LOGS } from "./[id]/containers/[containerId]/logs/route";
import { GET as GET_LOG_STREAM } from "./[id]/containers/[containerId]/logs/stream/route";

const queries = await import("@/lib/db/queries");
const mockList = queries.listDozzleEndpoints as ReturnType<typeof mock>;
const mockCreate = queries.createDozzleEndpoint as ReturnType<typeof mock>;
const mockGet = queries.getDozzleEndpoint as ReturnType<typeof mock>;
const mockUpdate = queries.updateDozzleEndpoint as ReturnType<typeof mock>;
const mockDelete = queries.deleteDozzleEndpoint as ReturnType<typeof mock>;

const originalFetch = globalThis.fetch;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function containerParams(id: string, containerId: string) {
  return { params: Promise.resolve({ id, containerId }) };
}

afterEach(() => {
  mockList.mockReset();
  mockCreate.mockReset();
  mockGet.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  globalThis.fetch = originalFetch;
});

describe("/api/docker-logs/endpoints", () => {
  test("lists configured Dozzle endpoints in order", async () => {
    mockList.mockResolvedValue([
      { id: 2, name: "Backup", apiUrl: "http://backup:8080", enabled: true, order: 1 },
      { id: 1, name: "Main", apiUrl: "http://main:8080", enabled: true, order: 0 },
    ]);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(2);
  });

  test("creates an endpoint with a normalized URL", async () => {
    mockCreate.mockResolvedValue({ id: 1, name: "Main", apiUrl: "http://main:8080", enabled: true, order: 0 });

    const response = await POST(new Request("http://localhost/api/docker-logs/endpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: " Main ", apiUrl: "http://main:8080/" }),
    }));

    expect(response.status).toBe(201);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      name: "Main",
      apiUrl: "http://main:8080",
      enabled: true,
      order: 0,
    });
  });

  test("rejects non-http endpoint URLs", async () => {
    const response = await POST(new Request("http://localhost/api/docker-logs/endpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bad", apiUrl: "ftp://host" }),
    }));

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("/api/docker-logs/endpoints/:id", () => {
  test("gets an endpoint", async () => {
    mockGet.mockResolvedValue({ id: 1, name: "Main", apiUrl: "http://main:8080", enabled: true, order: 0 });
    const response = await GET_ONE(new Request("http://localhost"), params("1"));
    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe("Main");
  });

  test("updates an endpoint", async () => {
    mockGet.mockResolvedValue({ id: 1, name: "Main", apiUrl: "http://main:8080", enabled: true, order: 0 });
    mockUpdate.mockResolvedValue({ id: 1, name: "New", apiUrl: "http://new:8080", enabled: false, order: 2 });

    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: " New ", apiUrl: "http://new:8080/", enabled: false, order: 2 }),
    }), params("1"));

    expect(response.status).toBe(200);
    expect(mockUpdate.mock.calls[0][0]).toBe(1);
    expect(mockUpdate.mock.calls[0][1]).toEqual({ name: "New", apiUrl: "http://new:8080", enabled: false, order: 2 });
  });

  test("deletes an endpoint", async () => {
    mockGet.mockResolvedValue({ id: 1, name: "Main", apiUrl: "http://main:8080", enabled: true, order: 0 });
    mockDelete.mockResolvedValue({ id: 1 });
    const response = await DELETE_ONE(new Request("http://localhost"), params("1"));
    expect(response.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith(1);
  });
});

describe("Dozzle pass-through routes", () => {
  test("pipes the events SSE and keeps it unbuffered", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response("event: containers-changed\ndata: []\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    mockGet.mockResolvedValue({ id: 7, name: "Main", apiUrl: "http://main:8080", enabled: true, order: 0 });

    const response = await GET_EVENTS(new NextRequest("http://localhost/api/docker-logs/endpoints/7/events/stream"), params("7"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    expect(await response.text()).toContain("containers-changed");
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://main:8080/api/events/stream");
  });

  test("returns 502 when Dozzle is unavailable", async () => {
    globalThis.fetch = mock(async () => new Response("offline", { status: 503 })) as unknown as typeof fetch;
    mockGet.mockResolvedValue({ id: 7, name: "Main", apiUrl: "http://main:8080", enabled: true, order: 0 });

    const response = await GET_EVENTS(new NextRequest("http://localhost/api/docker-logs/endpoints/7/events/stream"), params("7"));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("unavailable");
  });

  test("forwards only the supported log query parameters", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response('{"ts":1}\n', {
        status: 200,
        headers: { "Content-Type": "application/x-jsonl" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    mockGet.mockResolvedValue({ id: 7, name: "Main", apiUrl: "http://main:8080", enabled: true, order: 0 });

    const request = new NextRequest(
      "http://localhost/api/docker-logs/endpoints/7/containers/abc/logs?host=host-1&min=300&stdout=&stderr=&levels=trace&levels=unknown&notAllowed=yes",
    );
    const response = await GET_LOGS(request, containerParams("7", "abc"));

    expect(response.status).toBe(200);
    const upstream = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstream.pathname).toBe("/api/hosts/host-1/containers/abc/logs");
    expect(upstream.searchParams.get("min")).toBe("300");
    expect(upstream.searchParams.getAll("levels")).toEqual(["trace", "unknown"]);
    expect(upstream.searchParams.get("notAllowed")).toBeNull();
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Accept: "application/x-jsonl" });
  });

  test("requires a host for log streams", async () => {
    mockGet.mockResolvedValue({ id: 7, name: "Main", apiUrl: "http://main:8080", enabled: true, order: 0 });
    const response = await GET_LOG_STREAM(
      new NextRequest("http://localhost/api/docker-logs/endpoints/7/containers/abc/logs/stream"),
      containerParams("7", "abc"),
    );
    expect(response.status).toBe(400);
  });
});
