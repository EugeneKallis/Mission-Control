/**
 * Unit tests for src/components/layout/mobile-header.tsx
 *
 * Covers:
 *  - Renders brand, version, and optional uptime
 *  - Renders a brand link to "/"
 *  - Menu button invokes onMenuClick
 *  - Menu button has the expected aria-label
 */
import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@/test-utils/render";
import { MobileHeader } from "./mobile-header";

const onMenuClick = mock(() => {});

describe("MobileHeader", () => {
  test("renders the brand text by default", () => {
    render(<MobileHeader onMenuClick={onMenuClick} />);
    expect(screen.getByText("Mission Control")).toBeInTheDocument();
  });

  test("renders a custom brand when provided", () => {
    render(<MobileHeader brand="Acme" onMenuClick={onMenuClick} />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  test("renders the version string", () => {
    render(<MobileHeader onMenuClick={onMenuClick} />);
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
  });

  test("renders a custom version when provided", () => {
    render(<MobileHeader version="2.4.0" onMenuClick={onMenuClick} />);
    expect(screen.getByText("v2.4.0")).toBeInTheDocument();
  });

  test("does not render uptime text when not provided", () => {
    const { container } = render(<MobileHeader onMenuClick={onMenuClick} />);
    // The version line exists; uptime should not be in the document.
    expect(container.textContent).not.toMatch(/uptime/i);
    // And the second inner div next to the version is empty.
    const versionContainer = screen.getByText("v0.1.0").parentElement;
    expect(versionContainer?.children.length).toBe(1);
  });

  test("renders the uptime text when provided", () => {
    render(<MobileHeader uptime="3d 4h" onMenuClick={onMenuClick} />);
    expect(screen.getByText("3d 4h")).toBeInTheDocument();
  });

  test("the brand is a link to /", () => {
    render(<MobileHeader onMenuClick={onMenuClick} />);
    const link = screen.getByLabelText("Go to home");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/");
  });

  test("menu button has the expected aria-label", () => {
    render(<MobileHeader onMenuClick={onMenuClick} />);
    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
  });

  test("clicking the menu button calls onMenuClick", () => {
    onMenuClick.mockReset();
    render(<MobileHeader onMenuClick={onMenuClick} />);
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });
});
