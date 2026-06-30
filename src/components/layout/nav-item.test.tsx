/**
 * Unit tests for src/components/layout/nav-item.tsx
 *
 * Covers:
 *  - Renders label and icon
 *  - href is on the underlying anchor
 *  - Active class applied when pathname matches href
 *  - Inactive class applied when pathname does not match href
 *  - color prop drives the hover accent class (with a fallback)
 */
import { describe, test, expect, mock } from "bun:test";
import { render, screen } from "@/test-utils/render";

// Mock next/navigation so usePathname returns a controllable value.
const mockUsePathname = mock(() => "/somewhere");
mock.module("next/navigation", () => ({
  usePathname: mockUsePathname,
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const { NavItem } = await import("./nav-item");

describe("NavItem", () => {
  test("renders the label text", () => {
    mockUsePathname.mockReturnValue("/other");
    render(<NavItem label="History" icon="history" href="/history" />);
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  test("renders the icon text inside the material symbol span", () => {
    mockUsePathname.mockReturnValue("/other");
    const { container } = render(<NavItem label="Logs" icon="terminal" href="/logs" />);
    const iconSpan = container.querySelector(".material-symbols-outlined");
    expect(iconSpan).not.toBeNull();
    expect(iconSpan?.textContent).toBe("terminal");
  });

  test("renders an anchor pointing at the href", () => {
    mockUsePathname.mockReturnValue("/other");
    render(<NavItem label="Schedules" icon="schedule" href="/schedules" />);
    const link = screen.getByText("Schedules").closest("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/schedules");
  });

  test("applies the active background class when pathname matches href", () => {
    mockUsePathname.mockReturnValue("/history");
    const { container } = render(<NavItem label="History" icon="history" href="/history" />);
    const link = container.querySelector("a");
    expect(link?.className).toContain("bg-surface-container-high");
    expect(link?.className).toContain("text-on-surface");
  });

  test("applies the inactive classes when pathname does not match href", () => {
    mockUsePathname.mockReturnValue("/other");
    const { container } = render(<NavItem label="History" icon="history" href="/history" />);
    const link = container.querySelector("a");
    expect(link?.className).toContain("text-on-surface-variant");
  });

  test("uses a known color's hover accent class", () => {
    mockUsePathname.mockReturnValue("/other");
    const { container } = render(<NavItem label="Logs" icon="terminal" href="/logs" color="amber" />);
    const link = container.querySelector("a");
    expect(link?.className).toContain("hover:bg-amber-500/10");
  });

  test("falls back to the primary accent class for unknown colors", () => {
    mockUsePathname.mockReturnValue("/other");
    const { container } = render(
      <NavItem label="Logs" icon="terminal" href="/logs" color={"not-a-color" as never} />,
    );
    const link = container.querySelector("a");
    expect(link?.className).toContain("hover:bg-primary/10");
  });
});
