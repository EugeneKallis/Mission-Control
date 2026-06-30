/**
 * Tests for src/components/ui/status-pill.tsx
 * Covers: variant classes, default vs custom label, statusVariantFromString.
 */
import { describe, test, expect } from "bun:test";
import { render, screen } from "@/test-utils/render";
import { StatusPill, statusVariantFromString } from "./status-pill";

describe("StatusPill", () => {
  test("applies success classes for the success variant", () => {
    render(<StatusPill status="success" />);
    const pill = screen.getByText("Success");
    expect(pill.className).toContain("text-primary");
    expect(pill.className).toContain("border-primary/30");
  });

  test("applies failed/error classes for the failed variant", () => {
    render(<StatusPill status="failed" />);
    const pill = screen.getByText("Failed");
    expect(pill.className).toContain("text-error");
    expect(pill.className).toContain("border-error/30");
  });

  test("applies running classes for the running variant", () => {
    render(<StatusPill status="running" />);
    const pill = screen.getByText("Running");
    expect(pill.className).toContain("text-indigo-400");
    expect(pill.className).toContain("border-indigo-500/30");
  });

  test("uses the explicit label when provided", () => {
    render(<StatusPill status="success" label="OK" />);
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  test("capitalises the status name when no label is given", () => {
    render(<StatusPill status="running" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });
});

describe("statusVariantFromString", () => {
  test("returns 'success' for 'success'", () => {
    expect(statusVariantFromString("success")).toBe("success");
  });

  test("returns 'failed' for 'failed'", () => {
    expect(statusVariantFromString("failed")).toBe("failed");
  });

  test("returns 'running' for any other string (including 'pending', 'queued', '')", () => {
    expect(statusVariantFromString("pending")).toBe("running");
    expect(statusVariantFromString("queued")).toBe("running");
    expect(statusVariantFromString("")).toBe("running");
    expect(statusVariantFromString("unknown")).toBe("running");
  });
});
