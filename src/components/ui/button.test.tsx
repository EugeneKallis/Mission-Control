/**
 * Tests for src/components/ui/button.tsx
 * Covers: default variant, variant classes, disabled, onClick, className passthrough.
 */
import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@/test-utils/render";
import { Button } from "./button";

describe("Button", () => {
  test("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  test("defaults to the ghost variant", () => {
    render(<Button>Ghost</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("border-primary/20");
  });

  test("applies the primary variant classes", () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-gradient-to-br");
  });

  test("applies the danger variant classes", () => {
    render(<Button variant="danger">Danger</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("text-error");
  });

  test("fires onClick when clicked", () => {
    const onClick = mock();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("does not fire onClick when disabled", () => {
    const onClick = mock();
    render(
      <Button onClick={onClick} disabled>
        Disabled
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  test("merges custom className with the variant classes", () => {
    render(<Button className="custom-class">X</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("custom-class");
    expect(btn.className).toContain("inline-flex");
  });

  test("forwards arbitrary button attributes (type, name)", () => {
    render(<Button type="submit" name="submit-btn">Submit</Button>);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("type")).toBe("submit");
    expect(btn.getAttribute("name")).toBe("submit-btn");
  });
});
