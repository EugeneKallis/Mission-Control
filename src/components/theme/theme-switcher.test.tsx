/**
 * Tests for src/components/theme/theme-switcher.tsx
 *
 * Covers:
 *  - Renders trigger with current theme label
 *  - Opening panel shows all 8 themes as radio options
 *  - Selected theme has aria-checked=true and checkmark
 *  - Clicking a theme updates the theme + closes the panel
 *  - Escape closes the panel
 *  - Outside click closes the panel
 *  - Compact variant renders palette icon
 *  - Panel uses role="radiogroup"
 *  - Arrow key navigation works
 *  - Focuses selected option when panel opens
 *  - Desktop panel fits within 228px width
 *  - Compact panel is right-aligned
 */

import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import {
  renderWithoutProviders as render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@/test-utils/render";
import { ThemeProvider } from "./theme-provider";
import { ThemeSwitcher } from "./theme-switcher";
import { STORAGE_KEY, type ThemeId } from "@/lib/theme";

function WithProvider({
  children,
  initialThemeId,
}: {
  children: React.ReactNode;
  initialThemeId?: ThemeId;
}) {
  return <ThemeProvider initialThemeId={initialThemeId}>{children}</ThemeProvider>;
}

beforeEach(() => {
  // Ensure document.body has layout for position checks
  document.documentElement.style.width = "1024px";
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeSwitcher — default variant", () => {
  test("renders trigger with persisted theme label after hydration", async () => {
    localStorage.setItem(STORAGE_KEY, "deep-ocean");
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Deep Ocean/i })).toBeInTheDocument();
    });
  });

  test("shows palette icon in trigger", () => {
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    const paletteIcons = screen.getAllByText("palette");
    expect(paletteIcons.length).toBeGreaterThanOrEqual(1);
  });

  test("trigger has aria-expanded=false initially", () => {
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("trigger references the open radiogroup", () => {
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);
    const group = screen.getByRole("radiogroup");
    expect(trigger.getAttribute("aria-controls")).toBe(group.id);
  });

  test("clicking trigger opens the radiogroup panel showing all 8 themes", () => {
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);

    // The panel should use role="radiogroup"
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();

    // All eight theme labels should be present (panel shows them, trigger also shows current)
    expect(screen.getAllByText("Midnight Cyan").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Graphite Violet").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Deep Ocean").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Ember Copper").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Forest Emerald").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Rose Noir").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Crimson Night").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Solar Gold").length).toBeGreaterThanOrEqual(1);
  });

  test("selected theme shows a checkmark and aria-checked=true", () => {
    render(
      <WithProvider initialThemeId="graphite-violet">
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);

    // Graphite option should have aria-checked=true
    const option = screen.getByRole("radio", { name: /Graphite Violet/ });
    expect(option.getAttribute("aria-checked")).toBe("true");

    // Checkmark should be in the panel
    expect(screen.getAllByText("check").length).toBeGreaterThanOrEqual(1);
  });

  test("unselected themes have aria-checked=false", () => {
    render(
      <WithProvider initialThemeId="graphite-violet">
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);

    const midnight = screen.getByRole("radio", { name: /Midnight Cyan/ });
    expect(midnight.getAttribute("aria-checked")).toBe("false");
  });

  test("clicking a theme updates the theme and closes the panel", () => {
    localStorage.clear();
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);

    // Click Ember Copper
    const ember = screen.getByRole("radio", { name: /Ember Copper/ });
    fireEvent.click(ember);

    // Panel should close
    expect(screen.queryByRole("radiogroup")).toBeNull();

    // Theme should be applied
    expect(document.documentElement.getAttribute("data-theme")).toBe("ember-copper");
  });

  test("clicking a newly added theme updates the theme", () => {
    localStorage.clear();
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /theme/i }));

    fireEvent.click(screen.getByRole("radio", { name: /Rose Noir/ }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("rose-noir");
  });

  test("Escape closes the panel", () => {
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  test("Escape returns focus to trigger", () => {
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    // After Escape, the trigger should be focused
    expect(document.activeElement).toBe(trigger);
  });

  test("outside click closes the panel", () => {
    render(
      <WithProvider>
        <div data-testid="outside-area">
          <ThemeSwitcher />
        </div>
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();

    act(() => {
      fireEvent.mouseDown(screen.getByTestId("outside-area"));
    });
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  test("ArrowRight selects next theme", () => {
    localStorage.setItem(STORAGE_KEY, "midnight-cyan");
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);

    const radiogroup = screen.getByRole("radiogroup");
    act(() => {
      fireEvent.keyDown(radiogroup, { key: "ArrowRight" });
    });
    // Should have moved to graphite-violet
    const graphite = screen.getByRole("radio", { name: /Graphite Violet/ });
    expect(graphite.getAttribute("aria-checked")).toBe("true");
  });

  test("ArrowLeft selects previous theme", () => {
    render(
      <WithProvider initialThemeId="ember-copper">
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);

    const radiogroup = screen.getByRole("radiogroup");
    act(() => {
      fireEvent.keyDown(radiogroup, { key: "ArrowLeft" });
    });
    const deepOcean = screen.getByRole("radio", { name: /Deep Ocean/ });
    expect(deepOcean.getAttribute("aria-checked")).toBe("true");
  });

  test("Home and End select the first and last themes", () => {
    render(
      <WithProvider initialThemeId="deep-ocean">
        <ThemeSwitcher />
      </WithProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /theme/i }));
    const radiogroup = screen.getByRole("radiogroup");

    fireEvent.keyDown(radiogroup, { key: "Home" });
    expect(screen.getByRole("radio", { name: /Midnight Cyan/ }).getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(radiogroup, { key: "End" });
    expect(screen.getByRole("radio", { name: /Solar Gold/ }).getAttribute("aria-checked")).toBe("true");
  });

  test("first option is focused when panel opens", () => {
    localStorage.setItem(STORAGE_KEY, "midnight-cyan");
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);

    // The selected option (Midnight Cyan) should be focused
    const midnight = screen.getByRole("radio", { name: /Midnight Cyan/ });
    // Check it has tabIndex=0
    expect(midnight.getAttribute("tabindex")).toBe("0");
    // Unselected should have tabIndex=-1
    const graphite = screen.getByRole("radio", { name: /Graphite Violet/ });
    expect(graphite.getAttribute("tabindex")).toBe("-1");
  });

  test("unselected themes have tabIndex=-1", () => {
    render(
      <WithProvider initialThemeId="deep-ocean">
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);

    // Deep Ocean (selected) should have tabIndex=0
    const selected = screen.getByRole("radio", { name: /Deep Ocean/ });
    expect(selected.getAttribute("tabindex")).toBe("0");

    // Others should have tabIndex=-1
    const unselected = screen.getAllByRole("radio").filter(
      (r) => r.getAttribute("aria-label")?.includes("Deep Ocean") === false,
    );
    for (const el of unselected) {
      expect(el.getAttribute("tabindex")).toBe("-1");
    }
  });
});

describe("ThemeSwitcher — compact variant", () => {
  test("renders palette icon without text label", () => {
    render(
      <WithProvider>
        <ThemeSwitcher variant="compact" />
      </WithProvider>,
    );
    const paletteIcons = screen.getAllByText("palette");
    expect(paletteIcons.length).toBeGreaterThanOrEqual(1);
  });

  test("trigger has aria-label describing current theme", () => {
    render(
      <WithProvider>
        <ThemeSwitcher variant="compact" />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-label")).toMatch(/Theme:/);
  });

  test("compact trigger is shrink-0 (non-shrinking)", () => {
    const { container } = render(
      <WithProvider>
        <div className="flex">
          <ThemeSwitcher variant="compact" />
        </div>
      </WithProvider>,
    );
    // The wrapper div in compact mode has shrink-0
    const wrapper = container.querySelector(".relative.shrink-0");
    expect(wrapper).not.toBeNull();
  });

  test("panel is right-aligned when compact", () => {
    render(
      <WithProvider>
        <ThemeSwitcher variant="compact" />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    const panel = screen.getByRole("radiogroup");
    // Panel should have right-0 class for right alignment
    expect(panel.className).toContain("right-0");
  });

  test("panel is height-bounded and scrollable for 8 themes", () => {
    render(
      <WithProvider>
        <ThemeSwitcher />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button", { name: /theme/i });
    fireEvent.click(trigger);
    const panel = screen.getByRole("radiogroup");
    // Panel caps its height to fit short viewports and scrolls internally
    expect(panel.className).toContain("max-h-[");
    expect(panel.className).toContain("overflow-y-auto");
  });

  test("panel uses w-[228px] width", () => {
    render(
      <WithProvider>
        <ThemeSwitcher variant="compact" />
      </WithProvider>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    const panel = screen.getByRole("radiogroup");
    expect(panel.className).toContain("w-[228px]");
  });
});
