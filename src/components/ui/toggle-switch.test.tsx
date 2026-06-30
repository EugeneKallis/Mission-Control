/**
 * Tests for src/components/ui/toggle-switch.tsx
 * Covers: aria-checked reflects enabled, click fires onChange, disabled, label.
 */
import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@/test-utils/render";
import { ToggleSwitch } from "./toggle-switch";

describe("ToggleSwitch", () => {
  test("has role='switch' with aria-checked=true when enabled", () => {
    render(<ToggleSwitch enabled onChange={mock()} />);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  test("has aria-checked=false when disabled", () => {
    render(<ToggleSwitch enabled={false} onChange={mock()} />);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });

  test("calls onChange when clicked", () => {
    const onChange = mock();
    render(<ToggleSwitch enabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("uses label as the aria-label", () => {
    render(<ToggleSwitch enabled onChange={mock()} label="Auto-update" />);
    expect(
      screen.getByRole("switch", { name: "Auto-update" }),
    ).toBeInTheDocument();
  });

  test("updates aria-checked when the enabled prop changes", () => {
    const { rerender } = render(<ToggleSwitch enabled={false} onChange={mock()} />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    rerender(<ToggleSwitch enabled onChange={mock()} />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });
});
