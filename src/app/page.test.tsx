import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { render, waitFor } from "@/test-utils/render";

let connected = false;
let homeShellNoScroll = false;
const originalFetch = globalThis.fetch;
const fetchMock = mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

mock.module("@/components/layout/app-shell", () => ({
  AppShell: ({ children, noScroll }: { children: React.ReactNode; noScroll?: boolean }) => {
    homeShellNoScroll = noScroll === true;
    return <>{children}</>;
  },
}));
mock.module("@/components/toast-provider", () => ({
  useToast: () => ({ showToast: mock() }),
}));
mock.module("@/hooks/use-live-stream", () => ({
  useLiveStream: () => ({
    lines: [],
    isConnected: connected,
    clearLines: mock(),
    containerRef: { current: null },
    handleScroll: mock(),
  }),
}));

const { default: Home } = await import("./page");

beforeEach(() => {
  connected = false;
  homeShellNoScroll = false;
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL("http://localhost/");
  window.history.replaceState({}, "", "/?run_macro=42");
  fetchMock.mockImplementation(async (input) => new Response(
    String(input) === "/api/macros" ? "[]" : JSON.stringify({ ok: true }),
    { headers: { "Content-Type": "application/json" } },
  ));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  window.history.replaceState({}, "", "/");
});

test("uses the terminal as the home page scroll container", () => {
  render(<Home />);

  expect(homeShellNoScroll).toBe(true);
});

test("waits for the live stream before running and clearing a macro deep link", async () => {
  const view = render(<Home />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/macros"));
  expect(fetchMock.mock.calls.map(([input]) => input)).not.toContain("/api/run/42");
  expect(window.location.search).toBe("?run_macro=42");

  connected = true;
  view.rerender(<Home />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/run/42", { method: "POST" }));
  expect(window.location.search).toBe("");

  view.rerender(<Home />);
  expect(fetchMock.mock.calls.filter(([input]) => input === "/api/run/42")).toHaveLength(1);
});
