/**
 * Tests for src/components/ui/empty-state.tsx
 * Covers: default message, custom message, icon rendering.
 */
import { describe, test, expect } from "bun:test";
import { render, screen } from "@/test-utils/render";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  test("renders the default message when none is provided", () => {
    render(<EmptyState />);
    expect(screen.getByText("No data found.")).toBeInTheDocument();
  });

  test("renders a custom message", () => {
    render(<EmptyState message="Nothing here yet" />);
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.queryByText("No data found.")).not.toBeInTheDocument();
  });

  test("renders the icon when provided", () => {
    render(<EmptyState icon="inbox" />);
    expect(screen.getByText("inbox")).toBeInTheDocument();
  });

  test("does not render an icon element when not provided", () => {
    const { container } = render(<EmptyState message="x" />);
    const icons = container.querySelectorAll(".material-symbols-outlined");
    expect(icons).toHaveLength(0);
  });
});
