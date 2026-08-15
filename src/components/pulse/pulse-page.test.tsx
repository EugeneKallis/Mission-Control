import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@/test-utils/render";
import { PULSE_URL } from "@/lib/pulse";
import { PulsePage } from "./pulse-page";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

function mockStatus(body: unknown, status = 200) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe("PulsePage", () => {
  test("shows loading while the status request is pending", () => {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch;
    render(<PulsePage />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading Pulse status");
  });

  test("renders healthy status and public metrics", async () => {
    mockStatus({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      health: { status: "healthy", uptime: 7_200, dependencies: { monitor: true, scheduler: true } },
      version: { version: "6.2.1", build: "release" },
      security: { requiresAuth: true, ssoEnabled: false },
      resourceCount: 3,
      authenticated: true,
      errors: [],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Operational")).toBeInTheDocument());
    expect(screen.getByText("2h 0m")).toBeInTheDocument();
    expect(screen.getByText("6.2.1")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Authenticated API")).toBeInTheDocument();
  });

  test("renders degraded status and partial-data warning", async () => {
    mockStatus({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      health: { status: "degraded", dependencies: { monitor: true, websocket: false } },
      version: null,
      security: null,
      errors: ["/api/version: unavailable"],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Degraded")).toBeInTheDocument());
    expect(screen.getByText(/Some public Pulse details could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText("/api/version: unavailable")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  test("renders an actionable direct link when Pulse is unavailable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Pulse public API is unavailable");
    }) as typeof fetch;

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Open Pulse directly" }).getAttribute("href")).toBe(PULSE_URL);
  });

  test("shows upstream error details when the status route fails", async () => {
    mockStatus({ errors: ["/api/health: connection refused"] }, 502);

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("/api/health: connection refused")).toBeInTheDocument();
  });

  test("hints at a rejected key when authenticated resources yield no count", async () => {
    mockStatus({
      health: { status: "healthy", dependencies: { monitor: true } },
      version: { version: "6.2.1" },
      security: { requiresAuth: true },
      resourceCount: null,
      authenticated: true,
      resourcesError: "/api/resources returned HTTP 401",
      errors: ["/api/resources returned HTTP 401"],
    });

    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Operational")).toBeInTheDocument());
    expect(screen.getByText("Key rejected or resources unavailable")).toBeInTheDocument();
    expect(screen.getByText("/api/resources returned HTTP 401")).toBeInTheDocument();
  });

  test("keeps the full Pulse link available from the native dashboard", async () => {
    mockStatus({ health: { status: "healthy" }, version: {}, security: {}, errors: [] });
    render(<PulsePage />);
    await waitFor(() => expect(screen.getByText("Operational")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Full Pulse" }).getAttribute("href")).toBe(PULSE_URL);
    expect(screen.getByRole("link", { name: "Open authenticated Pulse dashboard" }).getAttribute("href")).toBe(PULSE_URL);
  });
});
