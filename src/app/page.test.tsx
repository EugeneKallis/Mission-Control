import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@/test-utils/render";
import { defaultSidebarLayout } from "@/lib/nav-registry";
mock.module("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
mock.module("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: mock(), replace: mock() }), useSearchParams: () => new URLSearchParams() }));

let connected = false;
let liveLines = ["fixture output"];
const originalFetch = globalThis.fetch;
const fetchMock = mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

mock.module("@/components/toast-provider", () => ({ ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, useToast: () => ({ showToast: mock() }) }));
mock.module("@/hooks/use-live-stream", () => ({
  useLiveStream: () => ({ lines: liveLines, isConnected: connected, clearLines: mock(), containerRef: { current: null }, handleScroll: mock(), setIsAutoScroll: mock() }),
}));

const { default: Home } = await import("./page");

const macroGroups = [{ group: { id: 1, name: "Utilities", ord: 0 }, macros: [{ id: 42, name: "Cleanup", description: "Remove stale files", groupName: "Utilities", ord: 0, commands: "[]" }] }];

beforeEach(() => {
  connected = true;
  liveLines = ["fixture output"];
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  const layout = defaultSidebarLayout();
  layout.groups = layout.groups.map((group) => ({ ...group, items: group.items.filter((item) => item !== "history") }));
  layout.hidden = ["history"];
  fetchMock.mockImplementation(async (input, init) => {
    if (String(input) === "/api/macros") return new Response(JSON.stringify(macroGroups), { status: 200 });
    if (String(input) === "/api/sidebar/layout") return new Response(JSON.stringify(layout), { status: 200 });
    if (String(input) === "/api/run/42" && init?.method === "POST") return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response("{}", { status: 200 });
  });
});


test("starts on Dashboard with organized macro and page cards", async () => {
  render(<Home />);
  const dashboard = document.getElementById("home-panel-dashboard")!;
  await waitFor(() => expect(within(dashboard).getByRole("button", { name: /Cleanup/ })).toBeInTheDocument());
  expect(screen.getByRole("tab", { name: "Dashboard" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Dashboard" })).toHaveAttribute("tabindex", "0");
  expect(screen.getByRole("tab", { name: "Terminal" })).toHaveAttribute("tabindex", "-1");
  expect(document.getElementById("home-panel-dashboard")).not.toHaveAttribute("hidden");
  expect(document.getElementById("home-panel-terminal")).toHaveAttribute("hidden");
  expect(within(dashboard).getByText("Utilities")).toBeInTheDocument();
  expect(within(dashboard).getAllByRole("link", { name: /History/ })).toHaveLength(1);
  expect(within(dashboard).getAllByRole("link", { name: /Navigation/ })).toHaveLength(1);
});

test("supports keyboard tab movement and one-click macro transition", async () => {
  render(<Home />);
  const dashboard = document.getElementById("home-panel-dashboard")!;
  await waitFor(() => expect(within(dashboard).getByRole("button", { name: /Cleanup/ })).toBeInTheDocument());
  const dashboardTab = screen.getByRole("tab", { name: "Dashboard" });
  fireEvent.keyDown(dashboardTab, { key: "ArrowRight" });
  const terminalTab = screen.getByRole("tab", { name: "Terminal" });
  expect(terminalTab).toHaveAttribute("aria-selected", "true");
  await waitFor(() => expect((document.activeElement as HTMLElement | null)?.id).toBe("home-tab-terminal"));
  fireEvent.keyDown(terminalTab, { key: "ArrowLeft" });
  expect(dashboardTab.getAttribute("aria-selected")).toBe("true");
  fireEvent.click(within(dashboard).getByRole("button", { name: /Cleanup/ }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => input === "/api/run/42")).toHaveLength(1));
  expect(terminalTab).toHaveAttribute("aria-selected", "true");
  expect(within(dashboard).getByText("Cleanup")).toBeInTheDocument();
  fireEvent.click(dashboardTab);
});

test("shows macro load failure and retries without losing prior data", async () => {
  fetchMock.mockImplementation(async (input) => String(input) === "/api/macros" ? new Response("bad", { status: 500 }) : new Response("{}", { status: 200 }));
  render(<Home />);
  await waitFor(() => expect(screen.getByText("Unable to load macros.")).toBeInTheDocument());
  fetchMock.mockImplementation(async (input) => String(input) === "/api/macros" ? new Response(JSON.stringify(macroGroups), { status: 200 }) : new Response("{}", { status: 200 }));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  const dashboard = document.getElementById("home-panel-dashboard")!;
  await waitFor(() => expect(within(dashboard).getByRole("button", { name: /Cleanup/ })).toBeInTheDocument());
});
