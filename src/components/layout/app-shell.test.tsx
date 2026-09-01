/**
 * Unit tests for src/components/layout/app-shell.tsx
 *
 * Covers:
 *  - Renders children inside the main scroll container
 *  - Renders a desktop SidebarContent aside
 *  - Renders the MobileHeader with a menu button
 *  - Clicking the mobile menu opens the drawer (visible backdrop)
 *  - Clicking the backdrop closes the drawer
 *  - noScroll=false (default) gives the scroll container overflow-y-auto
 *  - noScroll=true removes the overflow-y-auto class
 *
 * Strategy: mock next/navigation and globalThis.fetch.
 */
import { describe, test, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, within } from "@/test-utils/render";

const mockUsePathname = mock(() => "/");

mock.module("next/navigation", () => ({
  usePathname: mockUsePathname,
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const { AppShell } = await import("./app-shell");

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  mockUsePathname.mockReturnValue("/");
});

describe("AppShell — layout structure", () => {
  test("renders children inside the main scroll container", () => {
    render(
      <AppShell>
        <div data-testid="page">page content</div>
      </AppShell>,
    );
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  test("renders a desktop sidebar with SidebarContent (with brand text)", () => {
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    // The desktop sidebar always renders; brand "Mission Control" appears.
    expect(screen.getAllByText("Mission Control").length).toBeGreaterThan(0);
  });

  test("renders a mobile menu button with the expected aria-label", () => {
    const { container } = render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    // Use within(container) to avoid false matches against leaked
    // DOM from other test files that run in the same bun process.
    expect(within(container).getByLabelText("Open menu")).toBeInTheDocument();
  });

  test("exposes Pulse in the mobile drawer navigation", () => {
    const { container } = render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    fireEvent.click(within(container).getByLabelText("Open menu"));
    const drawer = within(container).getByRole("dialog", { name: "Navigation menu" });
    expect(within(drawer).getByRole("link", { name: "Pulse" })).toBeInTheDocument();
  });

  test("default noScroll=false gives the scroll container overflow-y-auto", () => {
    const { container } = render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    const scrollContainer = container.querySelector("#main-scroll-container");
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer?.className).toContain("overflow-y-auto");
    expect(scrollContainer?.className).toContain("min-h-0");
  });

  test("noScroll=true adds overflow-hidden and removes overflow-y-auto", () => {
    const { container } = render(
      <AppShell noScroll>
        <div>child</div>
      </AppShell>,
    );
    const scrollContainer = container.querySelector("#main-scroll-container");
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer?.className).toContain("overflow-hidden");
    expect(scrollContainer?.className).not.toContain("overflow-y-auto");
    expect(scrollContainer?.className).toContain("min-h-0");
  });
});

describe("AppShell — mobile drawer", () => {
  test("clicking the mobile menu button opens the drawer (backdrop appears)", () => {
    const { container } = render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    // Backdrop is not rendered while drawer is closed.
    expect(container.querySelector(".backdrop-blur-sm")).toBeNull();
    fireEvent.click(within(container).getByLabelText("Open menu"));
    expect(container.querySelector(".backdrop-blur-sm")).not.toBeNull();
  });

  test("the drawer has a touch-sized close button that closes it", () => {
    const { container } = render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    fireEvent.click(within(container).getByLabelText("Open menu"));
    const closeButton = within(container).getByLabelText("Close menu");
    expect(closeButton.className).toContain("size-11");
    fireEvent.click(closeButton);
    expect(container.querySelector(".backdrop-blur-sm")).toBeNull();
  });

  test("clicking the backdrop closes the drawer", () => {
    const { container } = render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    fireEvent.click(within(container).getByLabelText("Open menu"));
    const backdrop = container.querySelector(".backdrop-blur-sm");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(container.querySelector(".backdrop-blur-sm")).toBeNull();
  });
});

