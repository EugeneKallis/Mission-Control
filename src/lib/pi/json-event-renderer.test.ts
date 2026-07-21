/**
 * Tests for src/lib/pi/json-event-renderer.ts
 *
 * Covers every event type: connected, agent_start/end, turn_start/end,
 * message_start/update/end, tool_execution_start/update/end,
 * compaction_start/end, auto_retry_start/end, extension_error,
 * and unknown types.
 */

import { describe, test, expect } from "bun:test";
import { renderJsonEvent } from "./json-event-renderer";

// ── connected (session) ────────────────────────────────────────────────────

describe("connected", () => {
  test("renders session info", () => {
    const result = renderJsonEvent({
      type: "connected",
      sessionId: "abc123",
      cwd: "/home/user/project",
      timestamp: 1712345678,
    });
    expect(result).toBe("[session: abc123] cwd=/home/user/project");
  });
});

// ── agent_start / agent_end / agent_settled ───────────────────────────────

describe("agent lifecycle", () => {
  test("agent_start", () => {
    expect(renderJsonEvent({ type: "agent_start" })).toBe("[agent_start]");
  });

  test("agent_end", () => {
    expect(renderJsonEvent({ type: "agent_end" })).toBe("[agent_end]");
  });

  test("agent_settled", () => {
    expect(renderJsonEvent({ type: "agent_settled" })).toBe("[agent_settled]");
  });
});

// ── turn_start / turn_end ─────────────────────────────────────────────────

describe("turn lifecycle", () => {
  test("turn_start", () => {
    expect(renderJsonEvent({ type: "turn_start" })).toBe("[turn_start]");
  });

  test("turn_end", () => {
    expect(renderJsonEvent({ type: "turn_end" })).toBe("[turn_end]");
  });
});

// ── message_start (null) ──────────────────────────────────────────────────

describe("message_start", () => {
  test("returns null (too noisy)", () => {
    expect(renderJsonEvent({ type: "message_start", message: {} })).toBeNull();
  });
});

// ── message_update (null) ─────────────────────────────────────────────────

describe("message_update", () => {
  test("returns null (too noisy)", () => {
    expect(
      renderJsonEvent({ type: "message_update", message: {}, assistantMessageEvent: { type: "start" } })
    ).toBeNull();
  });
});

// ── message_end ────────────────────────────────────────────────────────────

describe("message_end", () => {
  test("renders assistant text content", () => {
    const result = renderJsonEvent({
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Hello! I found " },
          { type: "text", text: "the answer." },
        ],
      },
    });
    expect(result).toBe("Assistant: Hello! I found the answer.");
  });

  test("returns null when no text content", () => {
    const result = renderJsonEvent({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", name: "read" }],
      },
    });
    expect(result).toBeNull();
  });

  test("returns null when no message field", () => {
    expect(renderJsonEvent({ type: "message_end" })).toBeNull();
  });
});

// ── tool_execution_start ───────────────────────────────────────────────────

describe("tool_execution_start", () => {
  test("renders tool name and args", () => {
    const result = renderJsonEvent({
      type: "tool_execution_start",
      toolCallId: "call_1",
      toolName: "read",
      args: { path: "/etc/hosts" },
    });
    expect(result).toBe('[tool: read] args: {"path":"/etc/hosts"}');
  });

  test("truncates args JSON over 300 chars", () => {
    const longArgs = { data: "x".repeat(400) };
    const result = renderJsonEvent({
      type: "tool_execution_start",
      toolCallId: "call_2",
      toolName: "read",
      args: longArgs,
    });
    expect(result).toBeTruthy();
    expect(result!.length).toBeLessThan(350);
    expect(result).toContain("[tool: read]");
    expect(result).toContain("…");
  });

  test("handles missing args gracefully", () => {
    const result = renderJsonEvent({
      type: "tool_execution_start",
      toolCallId: "call_3",
      toolName: "ls",
    });
    expect(result).toBe("[tool: ls] args: ");
  });
});

// ── tool_execution_update (null) ──────────────────────────────────────────

describe("tool_execution_update", () => {
  test("returns null (too noisy)", () => {
    expect(
      renderJsonEvent({ type: "tool_execution_update", toolCallId: "c1", toolName: "read", args: {} })
    ).toBeNull();
  });
});

// ── tool_execution_end ─────────────────────────────────────────────────────

describe("tool_execution_end", () => {
  test("renders success result", () => {
    const result = renderJsonEvent({
      type: "tool_execution_end",
      toolCallId: "call_1",
      toolName: "read",
      result: {
        content: [{ type: "text", text: "File contents: hello world" }],
      },
      isError: false,
    });
    expect(result).toBe("[tool: read] File contents: hello world");
  });

  test("prefixes ERROR when isError is true", () => {
    const result = renderJsonEvent({
      type: "tool_execution_end",
      toolCallId: "call_2",
      toolName: "bash",
      result: {
        content: [{ type: "text", text: "Command failed with exit code 1" }],
      },
      isError: true,
    });
    expect(result).toBe("[tool: bash] ERROR: Command failed with exit code 1");
  });

  test("truncates result over 500 chars", () => {
    const longText = "x".repeat(600);
    const result = renderJsonEvent({
      type: "tool_execution_end",
      toolCallId: "call_3",
      toolName: "read",
      result: {
        content: [{ type: "text", text: longText }],
      },
      isError: false,
    });
    expect(result).toBeTruthy();
    expect(result!.length).toBeLessThan(550);
    expect(result).toContain("…");
  });

  test("handles missing result", () => {
    const result = renderJsonEvent({
      type: "tool_execution_end",
      toolCallId: "call_4",
      toolName: "read",
      isError: false,
    });
    expect(result).toBe("[tool: read] ");
  });
});

// ── compaction_start / compaction_end ──────────────────────────────────────

describe("compaction", () => {
  test("compaction_start with reason", () => {
    expect(renderJsonEvent({ type: "compaction_start", reason: "threshold" })).toBe("[compaction: threshold]");
  });

  test("compaction_end with reason", () => {
    expect(renderJsonEvent({ type: "compaction_end", reason: "manual" })).toBe("[compaction: manual]");
  });
});

// ── auto_retry_start / auto_retry_end ──────────────────────────────────────

describe("auto_retry", () => {
  test("auto_retry_start with attempt and error message", () => {
    const result = renderJsonEvent({
      type: "auto_retry_start",
      attempt: 2,
      maxAttempts: 3,
      delayMs: 5000,
      errorMessage: "Rate limit exceeded",
    });
    expect(result).toBe("[retry: attempt 2] Rate limit exceeded");
  });

  test("auto_retry_end success state", () => {
    const result = renderJsonEvent({
      type: "auto_retry_end",
      success: true,
      attempt: 2,
    });
    expect(result).toBe("[retry: attempt 2 success]");
  });

  test("auto_retry_end failed state with final error", () => {
    const result = renderJsonEvent({
      type: "auto_retry_end",
      success: false,
      attempt: 3,
      finalError: "API still unavailable",
    });
    expect(result).toBe("[retry: attempt 3 failed] API still unavailable");
  });
});

// ── extension_error ────────────────────────────────────────────────────────

describe("extension_error", () => {
  test("renders extension path and error", () => {
    const result = renderJsonEvent({
      type: "extension_error",
      extensionPath: "extensions/my-tool",
      event: "execute",
      error: "Tool not found",
    });
    expect(result).toBe("[extension_error: extensions/my-tool] Tool not found");
  });
});

// ── unknown type (null) ────────────────────────────────────────────────────

describe("unknown type", () => {
  test("returns null for unhandled event types", () => {
    expect(renderJsonEvent({ type: "unknown_event_type" as string, data: "blah" })).toBeNull();
  });

  test("returns null for response events", () => {
    expect(
      renderJsonEvent({ type: "response", command: "get_state", success: true })
    ).toBeNull();
  });

  test("returns null for queue_update", () => {
    expect(renderJsonEvent({ type: "queue_update", steering: [] })).toBeNull();
  });
});
