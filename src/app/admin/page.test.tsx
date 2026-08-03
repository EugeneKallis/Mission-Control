/**
 * Unit tests for src/app/admin/page.tsx
 *
 * Focus: macro actions. The full page is heavy (dnd, modals, log panel), so
 * this test only asserts the "Run" button on a macro row routes through the
 * macro-run funnel instead of POSTing directly to `/api/run/<id>`.
 */
import { describe, test, expect, mock, afterEach, beforeEach } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@/test-utils/render";

const mockPush = mock(() => {});
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: () => {}, back: () => {} }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

const { default: AdminPage } = await import("./page");

const originalFetch = globalThis.fetch;

function mockFetch(body: unknown) {
  globalThis.fetch = mock(async (url: string) => {
    if (url === "/api/macros") {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}");
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  mockPush.mockReset();
  cleanup();
});

beforeEach(() => {
  Object.defineProperty(document, "hidden", {
    value: false,
    writable: true,
    configurable: true,
  });
});

describe("AdminPage — macro run", () => {
  test("clicking Run on a macro pushes /?run_macro=<id> and does not POST /api/run", async () => {
    const groups = [
      {
        group: { id: 1, name: "Group", ord: 0 },
        macros: [{ id: 42, name: "Cleanup", description: "", ord: 0, groupName: "Group" }],
      },
    ];
    mockFetch(groups);
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByTitle("Run this macro")).toBeInTheDocument());

    const runBtn = screen.getByTitle("Run this macro");
    expect(runBtn).toBeTruthy();

    fireEvent.click(runBtn!);

    const pushCalls = (mockPush.mock as { calls: unknown[][] }).calls;
    expect(pushCalls.length).toBe(1);
    expect(pushCalls[0]?.[0]).toBe("/?run_macro=42");

    // No direct POST to /api/run/42 should have been issued.
    const fetchCalls = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock.calls;
    const runCalls = fetchCalls.filter((args: unknown[]) => args[0] === "/api/run/42");
    expect(runCalls.length).toBe(0);
  });
});
