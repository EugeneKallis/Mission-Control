/**
 * Tests for src/components/ui/terminal.tsx
 * Covers: children rendering, html dangerouslySetInnerHTML, className passthrough.
 */
import { describe, test, expect } from "bun:test";
import { render, screen } from "@/test-utils/render";
import { Terminal } from "./terminal";

describe("Terminal", () => {
  test("renders children when no html prop is provided", () => {
    render(<Terminal>hello world</Terminal>);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  test("renders html as innerHTML when html prop is provided", () => {
    render(<Terminal html='<span data-testid="html">rendered html</span>' />);
    expect(screen.getByTestId("html")).toBeInTheDocument();
    expect(screen.getByTestId("html").textContent).toBe("rendered html");
  });

  test("merges custom className with the base classes", () => {
    const { container } = render(<Terminal className="extra-class">x</Terminal>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("extra-class");
    expect(root.className).toContain("font-mono");
  });

  test("renders nothing inside when neither children nor html are provided", () => {
    const { container } = render(<Terminal />);
    const root = container.firstChild as HTMLElement;
    expect(root.textContent).toBe("");
  });

  test("html prop takes precedence over children", () => {
    render(
      <Terminal html='<span data-testid="from-html">HTML</span>'>
        Should not appear
      </Terminal>,
    );
    expect(screen.getByTestId("from-html")).toBeInTheDocument();
    expect(screen.queryByText("Should not appear")).not.toBeInTheDocument();
  });
});
