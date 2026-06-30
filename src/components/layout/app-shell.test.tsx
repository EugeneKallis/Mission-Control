/**
 * Unit tests for src/components/layout/app-shell.tsx
 *
 * Covers:
 *  - Renders children inside the main scroll container
 *  - Renders a desktop SidebarContent aside
 *  - Renders the MobileHeader with a menu button
 *  - Clicking the mobile menu opens the drawer (visible backdrop)
 *  - Clicking the backdrop closes the drawer
 *  - macro:run-agent event opens the AgentModal with the right macroId
 *  - macro:run-agent event cleanup: removing the listener on unmount
 *  - When on /, handleAgentRun dispatches macro:run with { macroId, agent }
 *  - When off /, handleAgentRun pushes a deep-link URL with agent encoded
 *  - showRightRail + rightRailSlot renders the right rail
 *  - showRightRail without rightRailSlot renders the default placeholder
 *  - noScroll=false (default) gives the scroll container overflow-y-auto
 *  - noScroll=true removes the overflow-y-auto class
 *
 * Strategy: mock next/navigation, the AgentModal (so we don't need its
 * real fetch behaviour), and globalThis.fetch.
 */
import { describe, test, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, waitFor, act, within } from "@/test-utils/render";

const mockUsePathname = mock(() => "/");
const mockPush = mock(() => {});

// Stub the AgentModal — we test the shell's behaviour, not the modal's.
const mockAgentModal = mock((props: Record<string, unknown>) => {
  const { open, macroId, onRun, onClose } = props as {
    open: boolean;
    macroId: number | null;
    onRun: (id: number, agent: string) => void;
    onClose: () => void;
  };
  if (!open) return null;
  return (
    <div data-testid="agent-modal">
      <div data-testid="agent-modal-macroId">{String(macroId)}</div>
      <button data-testid="agent-modal-run" onClick={() => onRun(99, "host-z")}>
        run
      </button>
      <button data-testid="agent-modal-close" onClick={onClose}>
        close
      </button>
    </div>
  );
});

mock.module("@/components/agent-modal", () => ({
  AgentModal: mockAgentModal,
}));

mock.module("next/navigation", () => ({
  usePathname: mockUsePathname,
  useRouter: () => ({ push: mockPush, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const { AppShell } = await import("./app-shell");

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  mockPush.mockReset();
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

  test("default noScroll=false gives the scroll container overflow-y-auto", () => {
    const { container } = render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    const scrollContainer = container.querySelector("#main-scroll-container");
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer?.className).toContain("overflow-y-auto");
  });

  test("noScroll=true removes the overflow-y-auto class", () => {
    const { container } = render(
      <AppShell noScroll>
        <div>child</div>
      </AppShell>,
    );
    const scrollContainer = container.querySelector("#main-scroll-container");
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer?.className).not.toContain("overflow-y-auto");
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
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(container.querySelector(".backdrop-blur-sm")).not.toBeNull();
  });

  test("clicking the backdrop closes the drawer", () => {
    const { container } = render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    fireEvent.click(screen.getByLabelText("Open menu"));
    const backdrop = container.querySelector(".backdrop-blur-sm");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(container.querySelector(".backdrop-blur-sm")).toBeNull();
  });
});

describe("AppShell — macro:run-agent event", () => {
  test("opening agent modal: dispatching macro:run-agent sets pendingMacroId and shows the modal", () => {
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    expect(screen.queryByTestId("agent-modal")).toBeNull();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("macro:run-agent", { detail: { macroId: 123, macroName: "M" } }),
      );
    });
    expect(screen.getByTestId("agent-modal")).toBeInTheDocument();
    expect(screen.getByTestId("agent-modal-macroId").textContent).toBe("123");
  });

  test("closing the modal removes it from the DOM", () => {
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent("macro:run-agent", { detail: { macroId: 1, macroName: "M" } }),
      );
    });
    expect(screen.getByTestId("agent-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("agent-modal-close"));
    expect(screen.queryByTestId("agent-modal")).toBeNull();
  });

  test("on /, the modal's onRun dispatches a macro:run event with the agent", () => {
    mockUsePathname.mockReturnValue("/");
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener("macro:run", listener);
    try {
      render(
        <AppShell>
          <div>child</div>
        </AppShell>,
      );
      act(() => {
        window.dispatchEvent(
          new CustomEvent("macro:run-agent", { detail: { macroId: 1, macroName: "M" } }),
        );
      });
      fireEvent.click(screen.getByTestId("agent-modal-run"));
      expect(events.length).toBe(1);
      expect(events[0].detail).toEqual({ macroId: 99, agent: "host-z" });
    } finally {
      window.removeEventListener("macro:run", listener);
    }
  });

  test("off /, the modal's onRun pushes a deep-link URL with the agent encoded", () => {
    mockUsePathname.mockReturnValue("/admin");
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent("macro:run-agent", { detail: { macroId: 1, macroName: "M" } }),
      );
    });
    fireEvent.click(screen.getByTestId("agent-modal-run"));
    expect(mockPush).toHaveBeenCalledTimes(1);
    const calls = (mockPush.mock as { calls: unknown[][] }).calls;
    expect(calls[0]?.[0]).toBe("/?run_macro=99&agent=host-z");
  });

  test("unmount removes the macro:run-agent listener", () => {
    const { unmount } = render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    unmount();
    // After unmount, dispatching the event should not mount a modal.
    window.dispatchEvent(
      new CustomEvent("macro:run-agent", { detail: { macroId: 1, macroName: "M" } }),
    );
    expect(screen.queryByTestId("agent-modal")).toBeNull();
  });
});

describe("AppShell — right rail", () => {
  test("does not render the right rail by default", () => {
    const { container } = render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    // The right rail is the aside with the xl:flex class. The
    // SidebarContent also contains the word "Macros", so we cannot
    // assert on the text — use the class selector instead.
    expect(container.querySelector("aside.xl\\:flex")).toBeNull();
  });

  test("renders the right rail when showRightRail is true", () => {
    const { container } = render(
      <AppShell showRightRail>
        <div>child</div>
      </AppShell>,
    );
    // The right rail is the aside with the xl:flex class.
    const rail = container.querySelector("aside.xl\\:flex");
    expect(rail).not.toBeNull();
    // The right rail shows the "No macros loaded." placeholder by default.
    expect(rail?.textContent).toMatch(/No macros loaded/);
  });

  test("renders the right rail with the default placeholder when no slot is provided", () => {
    const { container } = render(
      <AppShell showRightRail>
        <div>child</div>
      </AppShell>,
    );
    const rail = container.querySelector("aside.xl\\:flex");
    expect(rail?.textContent).toMatch(/No macros loaded/);
  });

  test("renders the right rail with the rightRailSlot when provided", () => {
    const { container } = render(
      <AppShell showRightRail rightRailSlot={<div data-testid="right-rail-content">slot</div>}>
        <div>child</div>
      </AppShell>,
    );
    const rail = container.querySelector("aside.xl\\:flex");
    expect(rail).not.toBeNull();
    // The slot content is rendered inside the right rail.
    const slot = rail?.querySelector('[data-testid="right-rail-content"]');
    expect(slot).not.toBeNull();
    expect(rail?.textContent).not.toMatch(/No macros loaded/);
  });
});
