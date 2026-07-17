/**
 * Unit tests for tool-result-renderers.tsx — per-tool rendering helpers.
 *
 * Tests cover the pure render helpers (renderBashOutput) and the React
 * renderToolResult router for each supported tool type.
 */
import { describe, test, expect } from "bun:test";
import { render, screen } from "@/test-utils/render";
import { renderBashOutput, renderToolResult } from "./tool-result-renderers";

// ── renderBashOutput ──────────────────────────────────────────────────────

describe("renderBashOutput", () => {
  test("strips ANSI escape sequences", () => {
    const input = "\x1B[32mgreen\x1B[0m \x1B[1mbold\x1B[0m";
    expect(renderBashOutput(input)).toBe("green bold");
  });

  test("preserves normal text", () => {
    const input = "hello world\nline 2";
    expect(renderBashOutput(input)).toBe("hello world\nline 2");
  });

  test("handles empty string", () => {
    expect(renderBashOutput("")).toBe("");
  });

  test("strips complex ANSI sequences", () => {
    const input = "\x1B[38;2;255;100;0mcolored\x1B[0m";
    expect(renderBashOutput(input)).toBe("colored");
  });
});

// ── renderToolResult ──────────────────────────────────────────────────────

describe("renderToolResult", () => {
  // ── bash ─────────────────────────────────────────────────────────────
  describe("bash tool", () => {
    test("renders command output in terminal-style", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "bash", args: "ls -la", result: "total 42\ndrwxr-xr-x  2 user staff  64 Jul 14 12:00 .", status: "complete" })}</>,
      );
      const pre = container.querySelector("pre");
      expect(pre).not.toBeNull();
      expect(pre?.textContent).toContain("total 42");
    });

    test("shows empty-output placeholder", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "bash", args: "ls", result: "", status: "complete" })}</>,
      );
      const pre = container.querySelector("pre");
      expect(pre?.textContent).toMatch(/empty output/i);
    });

    test("strips ANSI codes from bash output", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "bash", args: "echo test", result: "\x1B[32mhello\x1B[0m", status: "complete" })}</>,
      );
      // Should be green-400 terminal class, not raw codes
      expect(container.innerHTML).not.toContain("\x1B[");
      expect(container.textContent).toContain("hello");
    });
  });

  // ── read ──────────────────────────────────────────────────────────────
  describe("read tool", () => {
    test("shows file path and content", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "read", args: JSON.stringify({ path: "/tmp/test.txt" }), result: "file content\nline 2", status: "complete" })}</>,
      );
      expect(container.textContent).toContain("/tmp/test.txt");
      expect(container.textContent).toContain("file content");
    });

    test("shows line count", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "read", args: '{"path":"foo.txt"}', result: "a\nb\nc", status: "complete" })}</>,
      );
      expect(container.textContent).toContain("3 lines");
    });

    test("shows empty-file placeholder when result is empty", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "read", args: '{"path":"empty.txt"}', result: "", status: "complete" })}</>,
      );
      expect(container.textContent).toMatch(/empty file/i);
    });

    test("handles missing args gracefully", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "read", args: "", result: "some content", status: "complete" })}</>,
      );
      // Should still show the content
      expect(container.textContent).toContain("some content");
    });
  });

  // ── edit ─────────────────────────────────────────────────────────────
  describe("edit tool", () => {
    test("shows diff markers with color classes", () => {
      const { container } = render(
        <>{renderToolResult({
          toolName: "edit",
          args: JSON.stringify({ path: "/tmp/test.ts" }),
          result: "--- a/test.ts\n+++ b/test.ts\n@@ -1 +1 @@\n-old line\n+new line",
          status: "complete",
        })}</>,
      );
      expect(container.textContent).toContain("/tmp/test.ts");
      // Should have green-colored (+) lines
      const plusLines = container.querySelectorAll(".text-green-500");
      expect(plusLines.length).toBeGreaterThanOrEqual(1);
      const plusTexts = Array.from(plusLines).map((el) => el.textContent ?? "");
      expect(plusTexts.some((t) => t.includes("+new line"))).toBe(true);
      // Should have red-colored (-) lines
      const minusLines = container.querySelectorAll(".text-error");
      expect(minusLines.length).toBeGreaterThanOrEqual(1);
      const minusTexts = Array.from(minusLines).map((el) => el.textContent ?? "");
      expect(minusTexts.some((t) => t.includes("-old line"))).toBe(true);
      // Should have cyan-colored (@@) lines
      const cyanLines = container.querySelectorAll(".text-cyan-500");
      expect(cyanLines.length).toBeGreaterThanOrEqual(1);
      expect(cyanLines[0]?.textContent).toContain("@@");
    });

    test("shows edit-applied text when result is empty", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "edit", args: '{"path":"f.ts"}', result: "", status: "complete" })}</>,
      );
      expect(container.textContent).toMatch(/edit applied/i);
    });

    test("renders non-diff result as plain text", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "edit", args: '{"path":"f.ts"}', result: "File has been updated successfully.", status: "complete" })}</>,
      );
      expect(container.textContent).toContain("File has been updated successfully.");
    });
  });

  // ── write ────────────────────────────────────────────────────────────
  describe("write tool", () => {
    test("shows creation indicator with file path", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "write", args: JSON.stringify({ path: "/tmp/newfile.ts" }), result: "console.log('hello')", status: "complete" })}</>,
      );
      expect(container.textContent).toContain("Created");
      expect(container.textContent).toContain("/tmp/newfile.ts");
      expect(container.textContent).toContain("console.log('hello')");
    });

    test("shows result content when present", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "write", args: '{"path":"f.ts"}', result: "export const x = 1;", status: "complete" })}</>,
      );
      expect(container.textContent).toContain("export const x = 1;");
    });
  });

  // ── unknown tool ─────────────────────────────────────────────────────
  describe("unknown tool", () => {
    test("renders generic fallback", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "some_custom_tool", args: '{"key":"val"}', result: "custom output", status: "complete" })}</>,
      );
      expect(container.textContent).toContain("custom output");
    });

    test("shows no-output placeholder for empty result", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "unknown_tool", args: "", result: "", status: "complete" })}</>,
      );
      expect(container.textContent).toMatch(/no output/i);
    });
  });

  // ── edge cases ───────────────────────────────────────────────────────
  describe("edge cases", () => {
    test("handles args that is valid JSON string", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "read", args: '{"path":"/ok"}', result: "ok", status: "complete" })}</>,
      );
      expect(container.textContent).toContain("/ok");
    });

    test("handles args that is invalid JSON string", () => {
      const { container } = render(
        <>{renderToolResult({ toolName: "edit", args: "not-json-{{", result: "result", status: "complete" })}</>,
      );
      // Should still render without crashing
      expect(container.textContent).toContain("result");
    });
  });
});
