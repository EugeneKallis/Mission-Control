/**
 * Unit tests for tool-call-card.tsx — tool execution card component.
 *
 * Tests cover rendering with each status, collapsible behavior, args
 * display, and delegated per-tool rendering.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@/test-utils/render";
import { ToolCallCard } from "./tool-call-card";
import type { ToolCallDisplay } from "./pi-chat-types";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal ToolCallDisplay with sensible defaults. */
function makeTc(overrides: Partial<ToolCallDisplay> = {}): ToolCallDisplay {
  return {
    toolCallId: "tc-1",
    toolName: "bash",
    args: '{"command":"ls -la"}',
    result: "total 42\nfile.txt",
    status: "complete",
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("ToolCallCard", () => {
  afterEach(() => cleanup());

  test("renders tool name", () => {
    render(<ToolCallCard tc={makeTc()} />);
    expect(screen.getByText("bash")).toBeTruthy();
  });

  test("renders truncated args in header", () => {
    render(<ToolCallCard tc={makeTc()} />);
    // The header shows truncated args
    expect(screen.getByText(/"command":"ls -la"/)).toBeTruthy();
  });

  test("has expand/collapse toggle", () => {
    render(<ToolCallCard tc={makeTc()} />);
    expect(screen.getByText("expand_more")).toBeTruthy();
  });

  test("shows args detail when expanded", () => {
    const { container } = render(<ToolCallCard tc={makeTc()} />);
    // By default, complete status starts collapsed
    // Find the expandable content area
    expect(container.textContent).toContain('"command":"ls -la"');
  });

  test("starts expanded for running status", () => {
    const { container } = render(
      <ToolCallCard tc={makeTc({ status: "running", result: "" })} />,
    );
    // Running status should show the loading animation class
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  test("starts collapsed for complete status", () => {
    render(<ToolCallCard tc={makeTc()} />);
    // Complete card starts collapsed, so the result may be inside
    // the collapsible area. The expand button should show expand_more.
    expect(screen.getByText("expand_more")).toBeTruthy();
  });

  test("shows hourglass_empty icon for pending status", () => {
    render(<ToolCallCard tc={makeTc({ status: "pending" })} />);
    expect(screen.getByText("hourglass_empty")).toBeTruthy();
  });

  test("truncates args longer than 60 chars in header", () => {
    const longArgs = '{"command":"' + "a".repeat(80) + '"}';
    render(<ToolCallCard tc={makeTc({ args: longArgs })} />);
    // The visible text in the header should end with "…" to indicate truncation
    expect(screen.getByText(/…$/)).toBeTruthy();
  });

  test("shows full args in expanded detail area", () => {
    const longArgs = '{"command":"' + "a".repeat(80) + '"}';
    const { container } = render(<ToolCallCard tc={makeTc({ args: longArgs, status: "running" })} />);
    // Running status starts expanded, so full args should be visible
    expect(container.textContent).toContain(longArgs);
  });

  test("shows error icon for error status", () => {
    const { container } = render(
      <ToolCallCard tc={makeTc({ status: "error", result: "Command failed" })} />,
    );
    expect(screen.getByText("error")).toBeTruthy();
  });

  test("renders bash output via tool-result-renderer", () => {
    const { container } = render(
      <ToolCallCard tc={makeTc({ toolName: "bash" })} />,
    );
    // Click to expand (card starts collapsed for complete status)
    const btn = container.querySelector("button");
    if (btn) fireEvent.click(btn);
    // The bash renderer uses green-400 terminal style
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain("total 42");
  });

  test("renders read file path via tool-result-renderer", () => {
    const { container } = render(
      <ToolCallCard
        tc={makeTc({
          toolName: "read",
          args: JSON.stringify({ path: "/tmp/readme.txt" }),
          result: "readme content",
        })}
      />,
    );
    // Click to expand (card starts collapsed for complete status)
    const btn = container.querySelector("button");
    if (btn) fireEvent.click(btn);
    expect(container.textContent).toContain("/tmp/readme.txt");
    expect(container.textContent).toContain("readme content");
  });

  test("renders edit diff markers via tool-result-renderer", () => {
    const { container } = render(
      <ToolCallCard
        tc={makeTc({
          toolName: "edit",
          args: JSON.stringify({ path: "/tmp/file.ts" }),
          result: "-old\n+new",
        })}
      />,
    );
    // Click to expand (card starts collapsed for complete status)
    const btn = container.querySelector("button");
    if (btn) fireEvent.click(btn);
    expect(container.textContent).toContain("/tmp/file.ts");
    expect(container.textContent).toContain("-old");
    expect(container.textContent).toContain("+new");
  });

  test("renders write creation indicator via tool-result-renderer", () => {
    const { container } = render(
      <ToolCallCard
        tc={makeTc({
          toolName: "write",
          args: JSON.stringify({ path: "/tmp/new.ts" }),
          result: "// fresh file",
        })}
      />,
    );
    // Click to expand (card starts collapsed for complete status)
    const btn = container.querySelector("button");
    if (btn) fireEvent.click(btn);
    expect(container.textContent).toContain("Created");
    expect(container.textContent).toContain("/tmp/new.ts");
    expect(container.textContent).toContain("// fresh file");
  });

  test("renders generic fallback for unknown tool", () => {
    const { container } = render(
      <ToolCallCard
        tc={makeTc({
          toolName: "grep",
          result: "grep output line 1",
        })}
      />,
    );
    // Click to expand (card starts collapsed for complete status)
    const btn = container.querySelector("button");
    if (btn) fireEvent.click(btn);
    expect(container.textContent).toContain("grep output line 1");
  });

  test("can toggle expanded state by clicking header", () => {
    // Running status starts expanded
    const { container } = render(
      <ToolCallCard tc={makeTc({ status: "running", result: "" })} />,
    );
    // Initially the result area is visible (since it's running)
    const toggleBtn = container.querySelector("button");
    expect(toggleBtn).not.toBeNull();

    // Find the expand_less icon (running starts expanded)
    const expandLess = screen.queryByText("expand_less");
    expect(expandLess).toBeTruthy();

    // Click to collapse
    if (toggleBtn) fireEvent.click(toggleBtn);
    expect(screen.queryByText("expand_more")).toBeTruthy();
  });
});
